import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { productionD1 } from './lib/d1-client.mjs';
import { getCatalogMarket } from '../shared/market-catalog.js';
import { historicalReference, repriceHistoricalTrade, reconcileHistoricalBook, utcTimestamp } from '../shared/historical-prices.js';
import { execFileSync } from 'node:child_process';

const query = productionD1();
const apply = process.argv.includes('--apply');
const cacheDirectory = 'tmp/trade-price-repair';
mkdirSync(cacheDirectory, { recursive: true });
const rows = async (sql, params) => (await query(sql, params))[0].results;
const literal = value => value === null || value === undefined ? 'NULL'
  : typeof value === 'number' ? Number.isFinite(value) ? String(value) : 'NULL'
    : `'${String(value).replaceAll("'", "''")}'`;

function providerSymbol(symbol) {
  const aliases = { SPX500: '^GSPC', NASDAQ: '^IXIC', DAX40: '^GDAXI', CAC40: '^FCHI' };
  if (['WTI', 'BRENT', 'XAU-USD', 'XAUUSD'].includes(symbol)) return null;
  if (aliases[symbol]) return aliases[symbol];
  const market = getCatalogMarket(symbol.replaceAll('-', ''));
  return market?.provider_symbol || symbol;
}

async function historicalBars(symbol, day) {
  const filename = `${cacheDirectory}/${symbol.replaceAll('^', '')}-${day}.json`;
  if (existsSync(filename)) {
    const cached = JSON.parse(readFileSync(filename, 'utf8'));
    if (cached.length) return cached;
    const captured = await rows("SELECT repair_json FROM trade_price_audit WHERE entity='provider_capture' AND record_id=?", [`${symbol}:${day}`]);
    const capture = JSON.parse(captured[0]?.repair_json || '{}');
    if (capture.status === 200 && capture.payload) {
      const binary = `${cacheDirectory}/${symbol}-${day}.bi5`;
      writeFileSync(binary, Buffer.from(capture.payload, 'base64'));
      const decoded = JSON.parse(execFileSync('python', ['scripts/lib/dukascopy-history.py', symbol, day, binary], { encoding: 'utf8', timeout: 60000 }));
      if (decoded.length) writeFileSync(filename, JSON.stringify(decoded));
      return decoded;
    }
    return cached;
  }
  const mapped = providerSymbol(symbol);
  if (!mapped) {
    const bars = JSON.parse(execFileSync('python', ['scripts/lib/dukascopy-history.py', symbol, day], { encoding: 'utf8', timeout: 60000 }));
    writeFileSync(filename, JSON.stringify(bars));
    return bars;
  }
  const start = Date.parse(`${day}T00:00:00Z`) / 1000;
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(mapped)}?interval=5m&period1=${start}&period2=${start + 86400}&includePrePost=true`;
  let response;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      response = await fetch(url, { signal: AbortSignal.timeout(15000) });
      if (response.ok) break;
      if (response.status !== 429 && response.status < 500) return [];
    } catch (error) {
      if (attempt === 2) { console.warn(`${symbol} ${day}: ${error.message}`); return []; }
    }
    await new Promise(resolve => setTimeout(resolve, 2000 * (attempt + 1)));
  }
  if (!response?.ok) return [];
  const payload = await response.json();
  const result = payload.chart?.result?.[0];
  if (!result || result.meta?.symbol !== mapped) throw new Error(`Unexpected historical instrument for ${symbol}.`);
  const quote = result.indicators?.quote?.[0];
  const bars = (result.timestamp || []).map((time, index) => ({
    at: new Date(time * 1000).toISOString(), end: new Date((time + 300) * 1000).toISOString(),
    open: quote.open[index], close: quote.close[index], low: quote.low[index], high: quote.high[index],
    source: `Yahoo Finance historical ${mapped}`, kind: '5m bar open reference', url,
  })).filter(bar => bar.at.slice(0, 10) === day && bar.open > 0 && bar.close > 0);
  if (bars.length) writeFileSync(filename, JSON.stringify(bars));
  return bars;
}

const [trades, traders, simulations, history, paperFills, legacyPositions, legacyOrders] = await Promise.all([
  rows('SELECT * FROM trader_trades ORDER BY trader_id,traded_at,id'),
  rows('SELECT * FROM traders ORDER BY id'),
  rows('SELECT * FROM copy_simulation_state'),
  rows('SELECT * FROM trader_history'),
  rows('SELECT * FROM paper_fills ORDER BY id'),
  rows('SELECT * FROM positions'), rows('SELECT * FROM orders'),
]);
writeFileSync(`${cacheDirectory}/before.json`, JSON.stringify({ trades, traders, simulations, history, paperFills, legacyPositions, legacyOrders }));
const requests = new Map();
for (const trade of [...trades, ...paperFills]) {
  for (const time of [trade.traded_at || trade.filled_at, trade.closed_at].filter(Boolean)) {
    const day = new Date(utcTimestamp(time)).toISOString().slice(0, 10);
    requests.set(`${trade.symbol}:${day}`, { symbol: trade.symbol, day });
  }
}
const bars = new Map();
for (const [key, request] of requests) {
  const result = await historicalBars(request.symbol, request.day);
  bars.set(key, result);
  console.log(`${request.symbol} ${request.day}: ${result.length} historical bars`);
}
const reference = (symbol, at) => historicalReference(bars.get(`${symbol}:${new Date(utcTimestamp(at)).toISOString().slice(0, 10)}`) || [], at);
const valuationCache = new Map();
const valuation = (symbol, at) => {
  const key = `${symbol}:${at}`;
  if (valuationCache.has(key)) return valuationCache.get(key);
  let mark = reference(symbol, at);
  if (!mark) {
    const prior = [...bars.entries()].filter(([key]) => key.startsWith(`${symbol}:`)).flatMap(([, rows]) => rows)
      .filter(bar => Date.parse(bar.at) <= utcTimestamp(at) && utcTimestamp(at) - Date.parse(bar.at) <= 4 * 86400000)
      .sort((a, b) => a.at.localeCompare(b.at)).at(-1);
    if (prior) mark = { price: prior.close, at: prior.at, source: prior.source, kind: 'carried recorded close for valuation' };
  }
  valuationCache.set(key, mark);
  return mark;
};
const corrections = trades.map(trade => {
  if (trade.price_review_status === 'reconstructed') {
    return { id: trade.id, trader_id: trade.trader_id, status: 'reconstructed', original: trade, repair: null };
  }
  const entry = reference(trade.symbol, trade.traded_at);
  const exit = trade.closed_at ? reference(trade.symbol, trade.closed_at) : null;
  const sourced = trade.price_basis === 'market' && trade.entry_price_source && trade.entry_quote_at
    && new Date(utcTimestamp(trade.entry_quote_at)).toISOString().slice(0, 10) === trade.traded_at.slice(0, 10)
    && (trade.status !== 'CLOSED' || trade.exit_price_source && trade.exit_quote_at
      && new Date(utcTimestamp(trade.exit_quote_at)).toISOString().slice(0, 10) === trade.closed_at.slice(0, 10));
  if (sourced) return { id: trade.id, trader_id: trade.trader_id, status: 'verified', original: trade, repair: null };
  const config = JSON.parse(simulations.find(row => row.trader_id === trade.trader_id)?.config || '{}');
  const repair = repriceHistoricalTrade(trade, entry, exit, config.feeBps ?? 1);
  return { id: trade.id, trader_id: trade.trader_id, status: repair ? 'reconstructed' : 'awaiting_history', original: trade, repair };
});
const fillChecks = paperFills.map(fill => {
  const ref = reference(fill.symbol, fill.filled_at);
  const age = utcTimestamp(fill.filled_at) - utcTimestamp(fill.quote_updated_at);
  const sameDay = fill.filled_at.slice(0, 10) === fill.quote_updated_at.slice(0, 10);
  return { id: fill.id, original: fill, reference: ref,
    status: ref && sameDay && age >= -1000 && age <= 20 * 60000 && fill.price >= ref.low * 0.999 && fill.price <= ref.high * 1.001 ? 'verified_provider_receipt' : 'requires_review' };
});
const report = { prepared_at: new Date().toISOString(), corrections, paper_fills: fillChecks,
  summary: Object.fromEntries(['verified', 'reconstructed', 'awaiting_history'].map(status => [status, corrections.filter(row => row.status === status).length])) };
writeFileSync(`${cacheDirectory}/plan.json`, JSON.stringify(report, null, 2));
console.log(JSON.stringify({ ...report.summary, paper_verified: fillChecks.filter(row => row.status === 'verified_provider_receipt').length, paper_total: fillChecks.length }));

if (!apply) process.exit(0);
const followCount = (await rows("SELECT count(*) count FROM copy_follows"))[0].count;
if (followCount) throw new Error('This repair requires follower-ledger reconciliation for existing copy accounts. No changes have been applied.');
const lock = `price-repair:${crypto.randomUUID()}`;
const now = Date.now();
const acquired = await query("UPDATE cron_job_state SET lock_token=?,lease_until=? WHERE job='copy-trading' AND lease_until<=?", [lock, now + 240000, now]);
if (acquired[0].meta.changes !== 1) throw new Error('Copy processing is active. Retry after its current lease finishes.');
const audit = (entity, id, original, repair) => `INSERT INTO trade_price_audit (entity,record_id,original_json,repair_json) VALUES (${[entity, String(id), JSON.stringify(original), JSON.stringify(repair)].map(literal).join(',')}) ON CONFLICT(entity,record_id) DO UPDATE SET repair_json=excluded.repair_json;`;
try {
  const liveStates = await rows('SELECT * FROM copy_simulation_state');
  for (const trader of traders) {
    const stateRow = liveStates.find(row => row.trader_id === trader.id);
    if (!stateRow) continue;
    if (stateRow.last_tick !== simulations.find(row => row.trader_id === trader.id)?.last_tick) {
      throw new Error('A simulation changed while historical data was downloaded. Re-run with the cached historical bars.');
    }
    const traderCorrections = corrections.filter(row => row.trader_id === trader.id);
    if (traderCorrections.every(row => !row.repair)) {
      const statements = traderCorrections.filter(row => row.status !== 'reconstructed').flatMap(row => [
        audit('trader_trades', row.id, row.original, { status: row.status }),
        `UPDATE trader_trades SET price_review_status=${literal(row.status)} WHERE id=${row.id};`,
      ]);
      if (statements.length) await query(statements.join('\n'));
      continue;
    }
    const reconciliation = reconcileHistoricalBook(JSON.parse(stateRow.state), JSON.parse(stateRow.config), traderCorrections,
      history.filter(row => row.trader_id === trader.id), valuation);
    const statements = [];
    for (const correction of traderCorrections) {
      const { original, repair, status } = correction;
      if (repair || status !== 'reconstructed') statements.push(audit('trader_trades', original.id, original, { status, repair }));
      if (repair) {
        statements.push(`UPDATE trader_trades SET entry_price=${literal(repair.entry_price)},exit_price=${literal(repair.exit_price)},fees=${literal(repair.fees)},pnl=${literal(repair.pnl)},pnl_percent=${literal(repair.pnl_percent)},price_basis='historical_reference',entry_price_source=${literal(repair.entry.source + ' / ' + repair.entry.kind)},entry_quote_at=${literal(repair.entry.at)},exit_price_source=${literal(repair.exit ? repair.exit.source + ' / ' + repair.exit.kind : null)},exit_quote_at=${literal(repair.exit?.at)},price_review_status='reconstructed' WHERE id=${original.id};`);
      } else statements.push(`UPDATE trader_trades SET price_review_status=${literal(status)} WHERE id=${original.id};`);
    }
    const state = reconciliation.state;
    statements.push(audit('traders', trader.id, trader, { equity: state.equity, total_return: reconciliation.total_return }));
    statements.push(audit('copy_simulation_state', trader.id, stateRow, { equity: state.equity }));
    statements.push(`UPDATE traders SET current_equity=${literal(state.equity)},total_return=${literal(reconciliation.total_return)},max_drawdown=${literal(state.maxDrawdown)},daily_return=${literal(reconciliation.snapshots.at(-1)?.daily_return || 0)},
      total_trades=(SELECT count(*) FROM trader_trades WHERE trader_id=${trader.id} AND status='CLOSED'),
      win_rate_trades=coalesce((SELECT 100.0*sum(pnl>0)/nullif(count(*),0) FROM trader_trades WHERE trader_id=${trader.id} AND status='CLOSED'),0),updated_at=CURRENT_TIMESTAMP WHERE id=${trader.id};`);
    statements.push(`UPDATE copy_simulation_state SET state=${literal(JSON.stringify(state))} WHERE trader_id=${trader.id};`);
    for (const snapshot of reconciliation.snapshots) {
      statements.push(audit('trader_history', snapshot.id, history.find(row => row.id === snapshot.id), { equity: snapshot.equity, daily_return: snapshot.daily_return }));
      statements.push(`UPDATE trader_history SET equity=${literal(snapshot.equity)},daily_return=${literal(snapshot.daily_return)} WHERE id=${snapshot.id};`);
    }
    await query(statements.join('\n'));
    console.log(`Reconciled trader ${trader.id}`);
  }
  for (const fill of fillChecks) await query(audit('paper_fills', fill.id, fill.original, { status: fill.status, reference: fill.reference }));
  for (const [entity, records] of [['positions', legacyPositions], ['orders', legacyOrders]]) {
    for (const record of records.filter(row => /^PAPERQA\d+$/.test(row.symbol))) {
      await query(audit(entity, record.id, record, { status: 'test_instrument', reason: 'QA instrument has no real market price.' }));
    }
  }
} finally {
  await query("UPDATE cron_job_state SET lock_token=NULL,lease_until=0 WHERE job='copy-trading' AND lock_token=?", [lock]);
}
console.log('HISTORICAL_PRICE_REPAIR_APPLIED');

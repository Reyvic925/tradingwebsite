import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { handleCopyRequest, runCopyTradingTick as runMarketTick, applyCopyEvent } from '../../worker/copy-trading.js';
import { valueCopy, validateCopyRisk } from '../../shared/copy-risk.js';
import { loadCopyQuotes } from '../../worker/copy-quotes.js';
import { compareHistory } from '../../shared/trader-comparison.js';

const runCopyTradingTick = (env, now) => runMarketTick(env, now, {
  executionClock: () => now,
  quoteProvider: async market => ({ price: market.symbol === 'BTCUSD' ? 96000 : 200,
    price_source: 'Fixture feed', quote_updated_at: now.toISOString(), quote_stale: false }),
});
const sqlite = new DatabaseSync(':memory:');
for (const file of ['0001_d1_foundation.sql', '0018_traders.sql', '0020_copy_trading.sql', '0025_copy_trade_quote_provenance.sql','0027_trade_price_audit.sql']) sqlite.exec(readFileSync(`d1-migrations/${file}`, 'utf8'));
class Statement {
  constructor(sql) { this.sql = sql; this.args = []; }
  bind(...args) { this.args = args; return this; }
  async first() { return sqlite.prepare(this.sql).get(...this.args) || null; }
  async all() { return { results: sqlite.prepare(this.sql).all(...this.args) }; }
  async run() { return { meta: { changes: Number(sqlite.prepare(this.sql).run(...this.args).changes) } }; }
}
const db = { prepare: sql => new Statement(sql), async batch(statements) {
  sqlite.exec('BEGIN');
  try { const results = []; for (const statement of statements) results.push(await statement.run()); sqlite.exec('COMMIT'); return results; }
  catch (error) { sqlite.exec('ROLLBACK'); throw error; }
} };
const env = { DB: db };
sqlite.exec("INSERT INTO auth_users(id,email,password_hash,email_verified_at) VALUES ('u','u@example.test','unused','2026-01-01'),('other','other@example.test','unused','2026-01-01')");
sqlite.prepare('INSERT INTO auth_sessions(id,user_id,expires_at) VALUES (?,?,?)').run(createHash('sha256').update('test').digest('base64url'), 'u', '2099-01-01');
sqlite.exec("INSERT INTO wallets(user_id,currency,available,reserved) VALUES ('u','USD',10000,0)");
const call = (method, body, query = '', path = '/api/copy-trades') => handleCopyRequest(new Request(`https://example.test${path}${query}`, { method,
  headers: { cookie: 'apex_session=test', 'content-type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) }), env);
const settings = { trader_id: 4, allocated_amount: 1000, stop_loss_percent: 20, take_profit_percent: 200, leverage_multiplier: 1 };
assert.equal((await call('POST', { ...settings, stop_loss_percent: -5 })).status, 400);
assert.equal((await call('POST', { ...settings, allocated_amount: 20000 })).status, 400);
assert.equal(sqlite.prepare('SELECT available FROM wallets').get().available, 10000);
const created = await call('POST', settings);
assert.equal(created.status, 201, await created.clone().text());
const { id } = await created.json();
assert.equal(sqlite.prepare('SELECT available FROM wallets').get().available, 9000);
assert.equal(sqlite.prepare('SELECT reserved FROM wallets').get().reserved, 1000);
assert.equal((await call('POST', settings)).status, 400);
assert.equal(sqlite.prepare('SELECT available FROM wallets').get().available, 9000, 'failed duplicate reservation rolls back');
sqlite.prepare('UPDATE copy_follows SET followed_at=? WHERE id=?').run('2026-01-01', id);

// Retry the same scheduled tick and verify no duplicate fees, trades or balance movements.
const date = new Date('2026-11-13T15:00:00Z');
await runCopyTradingTick(env, date);
const count = sqlite.prepare('SELECT count(*) n FROM trader_trades').get().n;
await runCopyTradingTick(env, date);
assert.equal(sqlite.prepare('SELECT count(*) n FROM trader_trades').get().n, count);
for (let i = 1; i < 30 && !sqlite.prepare('SELECT * FROM copy_positions WHERE follow_id=?').get(id); i++) await runCopyTradingTick(env, new Date(+date + i * 300000));
assert(sqlite.prepare('SELECT * FROM copy_positions WHERE follow_id=?').get(id), 'copy opens an actual position');
assert.equal((await call('PUT', { status: 'paused' }, `?id=${id}`)).status, 200);
const paused = sqlite.prepare('SELECT * FROM copy_follows WHERE id=?').get(id);
for (let i = 30; i < 40; i++) await runCopyTradingTick(env, new Date(+date + i * 300000));
assert.equal(sqlite.prepare('SELECT * FROM copy_positions WHERE follow_id=?').get(id), undefined, 'paused existing position exits normally');
assert.notEqual(sqlite.prepare('SELECT current_value FROM copy_follows WHERE id=?').get(id).current_value, paused.current_value, 'paused open position still changes value');
assert.equal((await call('PUT', { status: 'active' }, `?id=${id}`)).status, 200);
const follow = sqlite.prepare('SELECT * FROM copy_follows WHERE id=?').get(id);
const loss = valueCopy(follow, -0.3);
assert.equal(loss.reason, 'drawdown_limit');
const event = { id: 'forced-risk', kind: 'stopped', reason: 'drawdown_limit', at: date.toISOString() };
assert(await applyCopyEvent(db, follow, loss, event));
assert.equal(await applyCopyEvent(db, follow, loss, event), false);
assert.equal(await applyCopyEvent(db, sqlite.prepare('SELECT * FROM copy_follows WHERE id=?').get(id), loss, event), false);
const settled = sqlite.prepare('SELECT * FROM wallets').get();
assert.equal(settled.reserved, 0);
assert.equal(settled.available, Math.round((9000 + loss.value) * 100) / 100);
assert.equal((await call('DELETE', null, `?id=${id}`)).status, 200);
assert.equal(sqlite.prepare('SELECT available FROM wallets').get().available, settled.available, 'repeated stop never pays twice');
assert.equal((await call('PUT', { status: 'active' }, `?id=${id}`)).status, 409);
const activities = await call('GET', null, '', '/api/copy-activity');
const entries = await activities.json();
assert(entries.length > 2);
for (const entry of entries) assert(Math.abs(entry.gross_pnl - entry.fees - entry.net_pnl) < 0.00001);
const denied = await handleCopyRequest(new Request('https://example.test/api/copy-activity'), env);
assert.equal(denied.status, 401);

const base = { allocated_amount: 1000, current_value: 1100, peak_value: 1200, fee_high_water: 1200, leverage_multiplier: 1, stop_loss_percent: 20, take_profit_percent: 200 };
assert.equal(valueCopy(base, 0, 20).fee, 0, 'no repeated fee on existing profit');
assert.equal(valueCopy(base, 0.05, 20).fee, 0, 'recovery below high water is free');
assert.equal(valueCopy({ ...base, current_value: 1200 }, 0.1, 20).fee, 24);
assert.equal(valueCopy({ ...base, current_value: 1000, peak_value: 1300 }, 0).reason, 'drawdown_limit', 'drawdown measures peak, not allocation');
assert.throws(() => validateCopyRisk({ ...settings, leverage_multiplier: Infinity }));
const comparison = compareHistory([{ id: 1, name: 'A' }], [{ trader_id: 1, snapshot_date: '2026-11-01', equity: 100 }, { trader_id: 1, snapshot_date: '2026-11-13', equity: 90 }], [], 30, date);
assert.equal(comparison.metrics[0].return, null, 'short history must not masquerade as 30-day return');
assert.equal(comparison.chart[1]['1'], 90);
const fullComparison = compareHistory([{ id: 1, name: 'A' }, { id: 2, name: 'B' }], [
  { trader_id: 1, snapshot_date: '2026-10-14', equity: 100 }, { trader_id: 1, snapshot_date: '2026-11-01', equity: 120 }, { trader_id: 1, snapshot_date: '2026-11-13', equity: 108 },
  { trader_id: 2, snapshot_date: '2026-10-14', equity: 200 }, { trader_id: 2, snapshot_date: '2026-11-13', equity: 180 },
], [], 30, date);
assert(Math.abs(fullComparison.metrics[0].return - 8) < 1e-8);
assert(Math.abs(fullComparison.metrics[0].drawdown - 10) < 1e-8);
assert.equal(fullComparison.chart.length, 2, 'chart compares shared dates only');
const second = await call('POST', settings);
assert.equal(second.status, 201);
const secondId = (await second.json()).id;
sqlite.prepare('UPDATE copy_follows SET followed_at=? WHERE id=?').run('2026-01-01', secondId);
for (let i = 40; i < 70 && !sqlite.prepare('SELECT * FROM copy_positions WHERE follow_id=?').get(secondId); i++) await runCopyTradingTick(env, new Date(+date + i * 300000));
assert(sqlite.prepare('SELECT * FROM copy_positions WHERE follow_id=?').get(secondId));
assert.equal((await call('DELETE', null, `?id=${secondId}`)).status, 200);
assert.equal(sqlite.prepare('SELECT * FROM copy_positions WHERE follow_id=?').get(secondId), undefined);
const stoppedCopy = sqlite.prepare('SELECT * FROM copy_follows WHERE id=?').get(secondId);
const stopEvent = sqlite.prepare("SELECT * FROM copy_activity WHERE follow_id=? AND kind='stopped'").get(secondId);
const netChanges = sqlite.prepare('SELECT sum(net_pnl) total FROM copy_activity WHERE follow_id=?').get(secondId).total;
assert(Math.abs(stoppedCopy.current_value - (1000 + netChanges)) < 0.00001);
assert(Math.abs(stopEvent.trade_pnl - netChanges) < 0.02, 'realized trade reconciles entry, marks, exit, and all fees');
sqlite.prepare('INSERT INTO auth_sessions(id,user_id,expires_at) VALUES (?,?,?)').run(createHash('sha256').update('other-token').digest('base64url'), 'other', '2099-01-01');
const otherActivity = await handleCopyRequest(new Request(`https://example.test/api/copy-activity?followId=${id}`, { headers: { cookie: 'apex_session=other-token' } }), env);
assert.deepEqual(await otherActivity.json(), [], 'another user cannot read a copy ledger');
const marketTrade = sqlite.prepare("SELECT * FROM trader_trades WHERE price_basis='market' LIMIT 1").get();
assert(marketTrade);
assert.equal(marketTrade.entry_price_source, 'Fixture feed');
assert(marketTrade.entry_quote_at);
const mappedSymbols = [];
const mappedQuotes = await loadCopyQuotes(['BTC-USD', 'SPX500', 'DAX40', 'WTI'], async market => {
  mappedSymbols.push(market.symbol);
  return { price: 10, price_source: 'Fixture feed', quote_updated_at: date.toISOString(), quote_stale: false };
});
assert.deepEqual(mappedSymbols.sort(), ['BTCUSD', 'GER40', 'US500']);
assert.equal(mappedQuotes['BTC-USD'].price, 10);
assert.equal(mappedQuotes.WTI, undefined, 'unsupported spot oil must not become a futures price');
const tickBefore = sqlite.prepare('SELECT max(last_tick) tick FROM copy_simulation_state').get().tick;
const noQuotes = await runMarketTick(env, new Date(+date + 100 * 300000), {
  quoteProvider: async () => ({ price: 1, quote_stale: true }),
});
assert(noQuotes.quote_unavailable > 0);
assert.equal(sqlite.prepare('SELECT max(last_tick) tick FROM copy_simulation_state').get().tick, tickBefore);
// Old open positions must not jump to a different price scale on the first market tick.
const legacyRecord = sqlite.prepare('SELECT * FROM copy_simulation_state WHERE trader_id=21').get();
const legacyState = JSON.parse(legacyRecord.state);
legacyState.priceBasis = 'synthetic';
legacyState.prices = { 'BTC-USD': 43200 };
legacyState.position = { symbol: 'BTC-USD', side: 'BUY', quantity: 0.1, entry_price: 43200,
  entry_fee: 0, equity_at_entry: legacyState.equity, age: 100, event_id: 'legacy-open',
  status: 'OPEN', traded_at: date.toISOString() };
sqlite.prepare('UPDATE copy_simulation_state SET state=? WHERE trader_id=21').run(JSON.stringify(legacyState));
await runCopyTradingTick(env, new Date(+date + 101 * 300000));
assert.equal(sqlite.prepare("SELECT * FROM trader_trades WHERE event_id='legacy-open'").get(), undefined, 'unrepaired legacy positions must never generate new invented executions');
assert.equal(JSON.parse(sqlite.prepare('SELECT state FROM copy_simulation_state WHERE trader_id=21').get().state).position.entry_price, 43200);
sqlite.close();
console.log('D1_COPY_TRADING_TESTS_PASSED');

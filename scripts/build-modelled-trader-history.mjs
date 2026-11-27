import { execSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { simulateTick } from '../api-handlers/synthetic-simulation.js';
import { calculateTradePerformance } from '../shared/trader-performance.js';

// Backfills a long, clearly modelled track record for selected traders using
// the same deterministic simulator as live ticks. It never claims the rows came
// from an exchange; every generated trade is labelled price_basis='synthetic'
// and modelled=1, and the profile UI shows a "Modelled strategy history" badge.
//
//   node scripts/build-modelled-trader-history.mjs --dry-run
//   node scripts/build-modelled-trader-history.mjs --apply

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const key = argv[index];
    if (!key.startsWith('--')) continue;
    const next = argv[index + 1];
    if (!next || next.startsWith('--')) {
      args[key.slice(2)] = true;
    } else {
      args[key.slice(2)] = next;
      index += 1;
    }
  }
  return args;
}

const args = parseArgs(process.argv.slice(2));
const apply = args.apply === true;
const database = String(args.db || 'apex-prime-db');
const environment = args.env ? ['--env', String(args.env)] : [];
const days = Math.min(3650, Math.max(30, Math.trunc(Number(args.days) || 730)));
const top = Math.max(1, Math.trunc(Number(args.top) || 9));
const ids = String(args.ids || '').split(',').map((id) => Number(id.trim())).filter((id) => Number.isInteger(id) && id > 0);

function query(sql) {
  const command = `npx wrangler d1 execute ${database} --remote --json --command "${sql.replaceAll('"', '\\"')}" ${environment.join(' ')}`;
  return JSON.parse(execSync(command, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }))[0]?.results || [];
}

const text = (value) => `'${String(value ?? '').replaceAll("'", "''")}'`;
const number = (value) => Number.isFinite(Number(value)) ? String(Number(value)) : 'NULL';

function chunks(rows, size = 150) {
  const output = [];
  for (let index = 0; index < rows.length; index += size) output.push(rows.slice(index, index + size));
  return output;
}

async function main() {
  const traders = query('SELECT traders.id, traders.name, traders.session_type, traders.recorded_starting_equity, traders.current_equity, copy_simulation_state.config FROM traders JOIN copy_simulation_state ON copy_simulation_state.trader_id = traders.id WHERE traders.is_active = 1 ORDER BY traders.total_return DESC').filter((trader) => !ids.length || ids.includes(trader.id));
  if (!traders.length) throw new Error('No traders matched');
  const selected = ids.length ? traders : traders.slice(0, top);

  const statements = [];
  const dayMs = 86400000;
  const endDate = new Date(Math.floor(Date.now() / dayMs) * dayMs - dayMs);
  const startDate = new Date(endDate.getTime() - (days - 1) * dayMs);
  const startDateText = startDate.toISOString().slice(0, 10);

  for (const trader of selected) {
    const config = JSON.parse(trader.config);
    const startEquity = Number(trader.recorded_starting_equity) > 0
      ? Number(trader.recorded_starting_equity)
      : Number(config.startingEquity) > 0 ? Number(config.startingEquity) : Number(trader.current_equity) || 100000;
    // One simulated tick equals one calendar day here, so the live minute-based
    // barriers need to be rescaled to stay reachable within a few daily bars.
    // The drift multiplier is the documented favourable-regime assumption for
    // this modelled history; it is opt-in and defaults to 1 in live ticks.
    const runConfig = { ...config, startingEquity: startEquity, compounding: true,
      maxHoldingTicks: 30,
      minimumSignalBps: 0,
      session: 'crypto',
      tradeProbability: 0.9,
      driftMultiplier: Number(args.drift ?? 4),
      directionBias: Number(args.bias ?? 0.98),
      riskFraction: 0.05,
      maxExposureFraction: 1,
      feeBps: 0, spreadBps: 0, slippageBps: 0,
      takeProfitVolatilityRatio: Number(args.tp ?? 0.5),
      stopLossVolatilityRatio: Number(args.sl ?? 3) };
    let state = { equity: startEquity, peakEquity: startEquity, prices: {}, lossStreak: 0 };
    const history = [];
    const trades = [];
    let opened = 0;

    for (let day = 1; day <= days; day += 1) {
      const date = new Date(startDate.getTime() + (day - 1) * dayMs).toISOString().slice(0, 10);
      const timestamp = `${date}T12:00:00.000Z`;
      const result = simulateTick({ traderId: trader.id, tickId: day, timestamp, config: runConfig, state });
      state = result.state;
      if (result.openedTrade) opened += 1;
      history.push({ date, equity: Number(state.equity) });
      if (result.trade) {
        trades.push({ ...result.trade, event_id: `modelled:${trader.id}:${day}` });
      }
    }

    const analytics = calculateTradePerformance({
      trades, history, startingEquity: startEquity,
    });
    console.log(`${trader.name} (#${trader.id}): ${days} days, ${analytics.closedTrades} trades, ${analytics.winRate}% wins, ${analytics.totalReturn}% return, ${analytics.maxDrawdown}% max DD, equity ${history[0]?.equity} -> ${history.at(-1)?.equity}, opened ${opened}`);

    statements.push(`DELETE FROM trader_history WHERE trader_id=${trader.id} AND modelled=1;`);
    // The modelled series replaces the trader's whole prior simulated trade log;
    // no user, wallet, follow, or copy-event data is touched.
    statements.push(`DELETE FROM trader_trades WHERE trader_id=${trader.id};`);

    let previousEquity = startEquity;
    const historyRows = history.map((row) => {
      const dailyReturn = previousEquity > 0 ? (row.equity / previousEquity - 1) * 100 : 0;
      previousEquity = row.equity;
      return `(${trader.id},${text(row.date)},${number(row.equity)},${number(dailyReturn)},1)`;
    });
    for (const group of chunks(historyRows)) {
      // OR REPLACE lets the modelled series overwrite any overlapping live
      // snapshot for the same (trader_id, snapshot_date) without breaking the
      // unique constraint; the latest live day remains untouched.
      statements.push(`INSERT OR REPLACE INTO trader_history (trader_id,snapshot_date,equity,daily_return,modelled) VALUES ${group.join(',')};`);
    }

    const tradeRows = trades.map((trade) => `(${trader.id},${text(trade.event_id)},${text(trade.symbol)},${text(trade.side)},`
      + `${number(trade.quantity)},${number(trade.entry_price)},${number(trade.exit_price)},${number(trade.pnl)},${number(trade.pnl_percent)},`
      + `${text('CLOSED')},${text(trade.traded_at)},${text(trade.closed_at)},${number(trade.fees)},${text(trade.close_reason)},${text('synthetic')},1)`);
    for (const group of chunks(tradeRows)) {
      statements.push(`INSERT INTO trader_trades (trader_id,event_id,symbol,side,quantity,entry_price,exit_price,pnl,pnl_percent,status,traded_at,closed_at,fees,close_reason,price_basis,modelled) VALUES ${group.join(',')};`);
    }

    const finalEquity = history.at(-1).equity;
    statements.push(`UPDATE copy_simulation_state SET state=${text(JSON.stringify({
      equity: finalEquity, peakEquity: Math.max(finalEquity, startEquity), prices: {}, lossStreak: 0,
      maxDrawdown: analytics.maxDrawdown, priceBasis: 'synthetic',
    }))} WHERE trader_id=${trader.id};`);
    statements.push(`UPDATE traders SET current_equity=${number(finalEquity)},`
      + `total_return=${number(analytics.totalReturn)},max_drawdown=${number(analytics.maxDrawdown)},monthly_return=0,`
      + `recorded_starting_equity=${number(startEquity)},performance_started_at=${text(`${startDateText}T00:00:00.000Z`)},`
      + `total_trades=(SELECT count(*) FROM trader_trades WHERE trader_id=${trader.id} AND status='CLOSED'),`
      + `win_rate_trades=coalesce((SELECT 100.0*sum(pnl>0)/nullif(count(*),0) FROM trader_trades WHERE trader_id=${trader.id} AND status='CLOSED'),0),`
      + `updated_at=${text(new Date().toISOString())} WHERE id=${trader.id};`);
  }

  if (!apply) {
    console.log(`\nDry run: ${statements.length} SQL statements. Pass --apply to write to ${database}.`);
    return;
  }

  const directory = mkdtempSync(join(tmpdir(), 'apex-modelled-history-'));
  const file = join(directory, 'history.sql');
  try {
    writeFileSync(file, statements.join('\n'));
    execSync(`npx wrangler d1 execute ${database} --remote --file "${file}" ${environment.join(' ')}`, { stdio: 'inherit' });
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
  console.log(`\nApplied modelled history for ${selected.length} trader(s).`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

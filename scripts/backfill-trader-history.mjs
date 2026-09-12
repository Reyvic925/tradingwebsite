import 'dotenv/config.js';
import { createClient } from '@supabase/supabase-js';
import { normalizeSyntheticConfig, simulateTick } from '../api-handlers/synthetic-simulation.js';

const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
if (!url || !key) throw new Error('Missing VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
const supabase = createClient(url, key);
const DAYS = 90;
const TICKS_PER_DAY = 24;
let supportsNotional = true;

async function retry(label, operation, attempts = 5) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const result = await operation();
    if (!result?.error) return result;
    lastError = result.error;
    console.warn(`${label} failed (${attempt}/${attempts}): ${lastError.message}`);
  }
  throw lastError;
}

async function insertBatches(table, rows, size = 500) {
  for (let index = 0; index < rows.length; index += size) {
    const batch = rows.slice(index, index + size).map((trade) => {
      if (table !== 'trade_logs' || supportsNotional) return trade;
      const { notional, ...withoutNotional } = trade;
      void notional;
      return withoutNotional;
    });
    try {
      await retry(`${table} batch ${index}`, () => supabase.from(table).insert(batch));
    } catch (error) {
      if (table === 'trade_logs' && supportsNotional && /notional/i.test(String(error.message || ''))) {
        supportsNotional = false;
        const fallbackBatch = rows.slice(index, index + size).map(({ notional, ...trade }) => trade);
        await retry(`${table} batch ${index} without optional notional`, () => supabase.from(table).insert(fallbackBatch));
      } else throw error;
    }
  }
}

async function backfillTrader(trader) {
  const { data: sim, error: stateError } = await retry(`load ${trader.name}`, () => supabase.from('trader_simulation_state').select('*').eq('trader_id', trader.id).maybeSingle());
  if (stateError) throw stateError;
  if (!sim) return { skipped: true };
  const config = normalizeSyntheticConfig(sim.config || {});
  await retry(`delete trades ${trader.name}`, () => supabase.from('trade_logs').delete().eq('trader_id', trader.id).not('event_id', 'is', null));
  await retry(`delete snapshots ${trader.name}`, () => supabase.from('synthetic_equity_snapshots').delete().eq('trader_id', trader.id));
  const now = Date.now();
  let state = { equity: config.startingEquity, peakEquity: config.startingEquity, prices: {}, lossStreak: 0 };
  const trades = [];
  const snapshots = [{ trader_id: trader.id, event_id: `${trader.id}:0`, tick_index: 0, snapshot_at: new Date(now - DAYS * 86400000).toISOString(), equity: config.startingEquity, daily_return: 0 }];
  for (let day = 0; day < DAYS; day += 1) {
    const dayStartEquity = state.equity;
    for (let tick = 0; tick < TICKS_PER_DAY; tick += 1) {
      const tickId = day * TICKS_PER_DAY + tick + 1;
      const timestamp = new Date(now - ((DAYS - day - 1) * 86400000) + (tick * 3600000)).toISOString();
      const result = simulateTick({ traderId: trader.id, tickId, timestamp, config, state });
      state = result.state;
      if (result.trade) trades.push(result.trade);
    }
    const snapshotAt = new Date(now - ((DAYS - day - 1) * 86400000) + 23 * 3600000).toISOString();
    snapshots.push({ trader_id: trader.id, event_id: `${trader.id}:${(day + 1) * TICKS_PER_DAY}`, tick_index: (day + 1) * TICKS_PER_DAY, snapshot_at: snapshotAt, equity: Number(state.equity.toFixed(8)), daily_return: dayStartEquity > 0 ? Number(((state.equity - dayStartEquity) / dayStartEquity).toFixed(12)) : 0 });
  }
  await insertBatches('trade_logs', trades);
  await insertBatches('synthetic_equity_snapshots', snapshots);
  await retry(`update state ${trader.name}`, () => supabase.from('trader_simulation_state').update({ state: { ...state, tickIndex: DAYS * TICKS_PER_DAY, lastProcessedAt: new Date().toISOString() }, tick_index: DAYS * TICKS_PER_DAY, last_processed_at: new Date().toISOString(), config, updated_at: new Date().toISOString() }).eq('trader_id', trader.id));
  return { trades: trades.length, snapshots: snapshots.length };
}

async function main() {
  const { data: traders, error } = await supabase.from('traders').select('id, name').order('id');
  if (error) throw error;
  const schemaProbe = await supabase.from('trade_logs').select('notional').limit(1);
  supportsNotional = !schemaProbe.error;
  console.log(`trade_logs.notional=${supportsNotional ? 'available' : 'not applied; using compatible columns'}`);
  const failures = [];
  for (const trader of traders || []) {
    try {
      console.log(trader.name, await backfillTrader(trader));
    } catch (error) {
      failures.push({ trader: trader.name, error: error.message });
      console.error(`FAILED ${trader.name}: ${error.message}`);
    }
  }
  if (failures.length) {
    console.error('History backfill failures:', failures);
    process.exitCode = 2;
  }
}

main().catch((error) => { console.error(error); process.exit(1); });
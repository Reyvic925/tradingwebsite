import 'dotenv/config.js';
import { createClient } from '@supabase/supabase-js';
import { calculateSyntheticMetrics } from '../api-handlers/synthetic-metrics.js';

const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
if (!url || !key) throw new Error('Missing VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
const supabase = createClient(url, key);
const issues = [];
const tolerance = 0.02;

const mismatch = (trader, field, stored, calculated) => {
  if (Math.abs(Number(stored || 0) - Number(calculated || 0)) > tolerance) {
    issues.push({ trader: trader.id, name: trader.name, field, stored, calculated, difference: Number(stored || 0) - Number(calculated || 0) });
  }
};

async function allRows(table, traderId, order = 'id') {
  const rows = [];
  const pageSize = 500;
  for (let offset = 0; ; offset += pageSize) {
    let query = supabase.from(table).select('*').eq('trader_id', traderId);
    if (table === 'trade_logs') query = query.not('event_id', 'is', null);
    const { data, error } = await query.order(order, { ascending: true }).range(offset, offset + pageSize - 1);
    if (error) throw error;
    rows.push(...(data || []));
    if (!data || data.length < pageSize) return rows;
  }
}

async function reconcile() {
  const { data: traders, error } = await supabase.from('traders').select('*');
  if (error) throw error;
  const [ticksResult, tradesResult, snapshotsResult] = await Promise.all([
    supabase.from('synthetic_ticks').select('event_id, trader_id, tick_index'),
    supabase.from('trade_logs').select('event_id, trader_id').not('event_id', 'is', null),
    supabase.from('synthetic_equity_snapshots').select('event_id, trader_id'),
  ]);
  if (ticksResult.error) throw ticksResult.error;
  if (tradesResult.error) throw tradesResult.error;
  if (snapshotsResult.error) throw snapshotsResult.error;
  const tickKeys = new Set();
  const tickEvents = new Set();
  for (const tick of ticksResult.data || []) {
    const key = `${tick.trader_id}:${tick.tick_index}`;
    if (tickKeys.has(key)) issues.push({ field: 'duplicate_tick', trader: tick.trader_id, name: '', stored: key, calculated: 'unique' });
    tickKeys.add(key);
    tickEvents.add(tick.event_id);
  }
  for (const trade of tradesResult.data || []) {
    if (!tickEvents.has(trade.event_id)) issues.push({ field: 'orphan_trade', trader: trade.trader_id, name: '', stored: trade.event_id, calculated: 'matching tick' });
  }
  for (const snapshot of snapshotsResult.data || []) {
    if (!tickEvents.has(snapshot.event_id)) issues.push({ field: 'orphan_equity_snapshot', trader: snapshot.trader_id, name: '', stored: snapshot.event_id, calculated: 'matching tick' });
  }
  for (const trader of traders || []) {
    const { data: state } = await supabase.from('trader_simulation_state').select('config').eq('trader_id', trader.id).maybeSingle();
    if (!state) {
      issues.push({ trader: trader.id, name: trader.name, field: 'simulation_state', stored: 'missing', calculated: 'required' });
      continue;
    }
    const [tradesResult, snapshotsResult, followsResult] = await Promise.all([
      allRows('trade_logs', trader.id, 'traded_at'),
      allRows('synthetic_equity_snapshots', trader.id, 'snapshot_at'),
      supabase.from('user_follows').select('user_id, is_copying, current_value, allocated_amount').eq('trader_id', trader.id),
    ]);
    if (tradesResult.error) throw tradesResult.error;
    if (snapshotsResult.error) throw snapshotsResult.error;
    if (followsResult.error) throw followsResult.error;
    const metrics = calculateSyntheticMetrics({ startingEquity: Number(state.config?.startingEquity) || 100000, trades: tradesResult.data || [], snapshots: snapshotsResult.data || [] });
    for (const field of ['current_equity', 'total_return', 'daily_return', 'total_trades', 'win_rate_trades', 'max_drawdown', 'volatility']) mismatch(trader, field, trader[field], metrics[field]);
    const follows = followsResult.data || [];
    const active = follows.filter((follow) => follow.is_copying);
    const allTime = new Set(follows.map((follow) => follow.user_id)).size;
    const aum = active.reduce((sum, follow) => sum + Number(follow.current_value || 0), 0);
    const copierProfit = active.reduce((sum, follow) => sum + Number(follow.current_value || 0) - Number(follow.allocated_amount || 0), 0);
    mismatch(trader, 'current_copiers', trader.copiers_current, active.length);
    mismatch(trader, 'all_time_copiers', trader.copiers_all_time, allTime);
    mismatch(trader, 'under_management', trader.under_management, aum);
    mismatch(trader, 'profit_for_copiers', trader.profit_for_copiers, copierProfit);
  }
  console.log(JSON.stringify({ traders: traders?.length || 0, issues: issues.length, details: issues }, null, 2));
  console.log(`RESULT: ${issues.length ? 'FAIL' : 'PASS'}`);
  if (issues.length) process.exitCode = 2;
}

reconcile().catch((error) => { console.error(error); process.exit(1); });

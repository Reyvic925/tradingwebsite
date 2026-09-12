import 'dotenv/config.js';
import { createClient } from '@supabase/supabase-js';
import { calculateSyntheticMetrics } from '../api-handlers/synthetic-metrics.js';

const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
if (!url || !key) throw new Error('Missing VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
const supabase = createClient(url, key);

const number = (value) => Number(value || 0);
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
const flagsFor = ({ trader, state, trades, snapshots, follows, metrics }) => {
  const flags = [];
  if (!state) flags.push('missing_state');
  if (state && !snapshots.length) flags.push('missing_history');
  if (state && state.last_processed_at && !trades.length) flags.push('zero_trades');
  const startingEquity = number(state?.config?.startingEquity) || 100000;
  const equityDelta = Math.abs(metrics.current_equity - startingEquity) / startingEquity;
  if (state && state.last_processed_at && metrics.total_return === 0 && metrics.total_trades > 0 && equityDelta < 1e-9) flags.push('zero_roi');
  if (state && state.last_processed_at && metrics.total_trades >= 20 && metrics.win_rate_trades === 50 && Math.abs(number(state.config?.targetWinRate) - 0.5) > 0.05) flags.push('default_win_rate');
  if (trader.is_active === false && follows.some((follow) => follow.is_copying)) flags.push('closed_copyable');
  const assets = Array.isArray(trader.asset_focus) ? trader.asset_focus.map((asset) => String(asset).toUpperCase()) : [];
  if (new Set(assets).size !== assets.length) flags.push('duplicate_assets');
  const description = `${trader.name} ${trader.bio || ''} ${trader.specialty || ''}`.toLowerCase();
  const cryptoAssets = assets.some((asset) => /^(BTC|ETH|SOL|AVAX|BNB)-?/.test(asset));
  const macroAssets = assets.some((asset) => /^(WTI|BRENT|XAU|GOLD)/.test(asset));
  if (/crypto|digital asset/.test(description) && macroAssets && !cryptoAssets) flags.push('asset_description_mismatch');
  return flags;
};

async function report() {
  const { data: traders, error } = await supabase.from('traders').select('*').order('id');
  if (error) throw error;
  const rows = [];
  for (const trader of traders || []) {
    const [stateResult, tradesResult, snapshotsResult, followsResult] = await Promise.all([
      supabase.from('trader_simulation_state').select('*').eq('trader_id', trader.id).maybeSingle(),
      allRows('trade_logs', trader.id, 'traded_at'),
      allRows('synthetic_equity_snapshots', trader.id, 'snapshot_at'),
      supabase.from('user_follows').select('is_copying, current_value, allocated_amount').eq('trader_id', trader.id),
    ]);
    if (stateResult.error) throw stateResult.error;
    if (tradesResult.error) throw tradesResult.error;
    if (snapshotsResult.error) throw snapshotsResult.error;
    if (followsResult.error) throw followsResult.error;
    const state = stateResult.data;
    const trades = tradesResult.data || [];
    const snapshots = snapshotsResult.data || [];
    const follows = followsResult.data || [];
    const metrics = calculateSyntheticMetrics({
      startingEquity: number(state?.config?.startingEquity) || 100000,
      trades,
      snapshots,
    });
    const activeCopiers = follows.filter((follow) => follow.is_copying);
    const flags = flagsFor({ trader, state, trades, snapshots, follows, metrics });
    rows.push({
      name: trader.name,
      status: trader.is_active === false ? 'CLOSED' : 'ACTIVE',
      strategy: state?.config?.strategyType || '-',
      startingEquity: number(state?.config?.startingEquity),
      currentEquity: metrics.current_equity,
      roi: metrics.total_return,
      winRate: metrics.win_rate_trades,
      trades: metrics.total_trades,
      drawdown: metrics.max_drawdown,
      volatility: metrics.volatility,
      copiers: activeCopiers.length,
      simulationState: state ? 'present' : 'missing',
      flags: flags.join(',') || 'OK',
    });
  }
  console.table(rows);
  const flagged = rows.filter((row) => row.flags !== 'OK');
  console.log(`REPORT: ${rows.length - flagged.length} PASS, ${flagged.length} FLAGGED`);
  if (flagged.length) process.exitCode = 2;
}

report().catch((error) => { console.error(error); process.exit(1); });

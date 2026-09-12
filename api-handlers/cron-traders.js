import supabase from './db-client.js';
import { calculateCopyFollowerValue } from './copy-trading-tick.js';
import { normalizeSyntheticConfig, simulateTick } from './synthetic-simulation.js';
import { calculateSyntheticMetrics } from './synthetic-metrics.js';
import { reconcileTraderCopierMetrics } from './copier-metrics.js';

const TICK_MS = 5 * 60 * 1000;
const MAX_CATCH_UP_TICKS = 288;

function authorized(req) {
  const secret = process.env.CRON_SECRET;
  const bearer = String(req.headers.authorization || '').replace(/^Bearer /, '');
  const provided = String(req.headers['x-cron-secret'] || req.query?.cron_secret || bearer);
  return Boolean(secret && provided === secret);
}

function tickTime(value) {
  return new Date(Math.floor(value.getTime() / TICK_MS) * TICK_MS);
}

async function loadRows(table, traderId, order = 'id') {
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

async function processTrader(trader, now) {
  let { data: simulation, error: stateError } = await supabase
    .from('trader_simulation_state')
    .select('*')
    .eq('trader_id', trader.id)
    .maybeSingle();
  if (stateError) throw stateError;
  if (!simulation) return { traderId: trader.id, skipped: true, reason: 'missing_simulation_state' };

  const config = normalizeSyntheticConfig(simulation.config || {});
  let state = simulation.state || {
    equity: config.startingEquity,
    peakEquity: config.startingEquity,
    prices: {},
    lossStreak: 0,
  };
  const currentTick = tickTime(now);
  const previousTick = simulation.last_processed_at ? tickTime(new Date(simulation.last_processed_at)) : null;
  const missed = previousTick
    ? Math.max(1, Math.floor((currentTick.getTime() - previousTick.getTime()) / TICK_MS))
    : 1;
  const ticks = Math.min(missed, MAX_CATCH_UP_TICKS);
  let generatedTrades = 0;
  let appliedTicks = 0;

  for (let offset = ticks; offset >= 1; offset -= 1) {
    const tickAt = new Date(currentTick.getTime() - ((offset - 1) * TICK_MS));
    const tickIndex = Number(simulation.tick_index || 0) + 1;
    const eventId = `${trader.id}:${tickIndex}`;
    const beforeEquity = Number(state.equity) || config.startingEquity;
    const result = simulateTick({
      traderId: trader.id,
      tickId: tickIndex,
      timestamp: tickAt.toISOString(),
      config,
      state,
    });
    state = result.state;
    simulation.tick_index = tickIndex;
    simulation.last_processed_at = tickAt.toISOString();
    appliedTicks++;

    const change = beforeEquity > 0 ? (Number(state.equity) - beforeEquity) / beforeEquity : 0;
    const { data: tickResult, error: tickError } = await supabase.rpc('apply_synthetic_tick', {
      p_event: {
        event_id: eventId,
        trader_id: trader.id,
        tick_index: tickIndex,
        tick_at: tickAt.toISOString(),
        equity_before: beforeEquity,
        equity_after: Number(state.equity),
        config,
        state,
        trade: result.trade,
      },
    });
    if (tickError) throw tickError;
    const applied = tickResult?.applied === true;
    if (applied) generatedTrades += result.trade ? 1 : 0;
    if (!applied) {
      state = { ...state, equity: Number(tickResult?.equity_after ?? state.equity), tickIndex, lastProcessedAt: tickAt.toISOString() };
      simulation.tick_index = tickIndex;
      simulation.last_processed_at = tickAt.toISOString();
    }
    await updateCopiers(trader, eventId, tickAt, change);
  }

  const [trades, snapshots] = await Promise.all([
    loadRows('trade_logs', trader.id, 'traded_at'),
    loadRows('synthetic_equity_snapshots', trader.id, 'snapshot_at'),
  ]);
  const metrics = calculateSyntheticMetrics({
    startingEquity: config.startingEquity,
    trades,
    snapshots,
  });
  const { error: updateError } = await supabase.from('traders').update({
    ...metrics,
    updated_at: now.toISOString(),
  }).eq('id', trader.id).eq('is_active', true);
  if (updateError) throw updateError;

  const { error: stateUpdateError } = await supabase.from('trader_simulation_state').update({
    config,
    state,
    tick_index: Number(simulation.tick_index || 0),
    last_processed_at: simulation.last_processed_at,
    updated_at: now.toISOString(),
  }).eq('trader_id', trader.id);
  if (stateUpdateError) throw stateUpdateError;

  return { traderId: trader.id, appliedTicks, generatedTrades, metrics };
}

async function updateCopiers(trader, eventId, tickAt, traderChange) {
  const { data: follows, error } = await supabase.from('user_follows').select('*').eq('trader_id', trader.id).eq('is_copying', true);
  if (error) throw error;
  const { data: existingSnapshots, error: snapshotLookupError } = await supabase
    .from('synthetic_copier_snapshots')
    .select('follow_id')
    .eq('event_id', eventId);
  if (snapshotLookupError) throw snapshotLookupError;
  const completedFollowIds = new Set((existingSnapshots || []).map((snapshot) => snapshot.follow_id));
  for (const follow of follows || []) {
    if (completedFollowIds.has(follow.id)) continue;
    const result = calculateCopyFollowerValue({
      currentValue: follow.current_value,
      allocatedAmount: follow.allocated_amount,
      traderChange,
      riskMultiplier: follow.leverage_multiplier,
      performanceFee: trader.profit_sharing_fee,
    });
    const previousPnl = Number(follow.pnl || 0);
    const fees = Number(follow.fees || 0) + Number(result.performanceFee || 0);
    const update = {
      current_value: result.currentValue,
      pnl: result.pnl,
      pnl_percent: result.pnlPercent,
      realized_pnl: result.pnl,
      unrealized_pnl: 0,
      fees,
      updated_at: tickAt.toISOString(),
    };
    const { error: followError } = await supabase.from('user_follows').update(update).eq('id', follow.id).eq('is_copying', true);
    if (followError) throw followError;
    const { error: snapshotError } = await supabase.from('synthetic_copier_snapshots').upsert({
      follow_id: follow.id,
      event_id: eventId,
      snapshot_at: tickAt.toISOString(),
      current_value: result.currentValue,
      realized_pnl: result.pnl,
      fees,
    }, { onConflict: 'follow_id,event_id' });
    if (snapshotError) throw snapshotError;
    void previousPnl;
  }

  await reconcileTraderCopierMetrics(supabase, trader.id);
}

export default async function handler(req, res) {
  if (!authorized(req)) return res.status(401).json({ error: 'Invalid or missing cron secret' });
  if (!['GET', 'POST'].includes(req.method)) return res.status(405).json({ error: 'Method not allowed' });
  try {
    const { data: traders, error } = await supabase.from('traders').select('id, name, is_active, profit_sharing_fee').eq('is_active', true);
    if (error) throw error;
    const results = [];
    for (const trader of traders || []) results.push(await processTrader(trader, new Date()));
    return res.status(200).json({ ok: true, results, timestamp: new Date().toISOString() });
  } catch (error) {
    console.error('[cron-traders] error', error);
    return res.status(500).json({ error: error.message });
  }
}

export { processTrader };

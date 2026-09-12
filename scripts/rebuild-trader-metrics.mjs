import 'dotenv/config.js';
import { createClient } from '@supabase/supabase-js';
import { calculateSyntheticMetrics } from '../api-handlers/synthetic-metrics.js';

const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
if (!url || !key) throw new Error('Missing VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
const supabase = createClient(url, key);

async function rows(table, traderId, order) {
  const result = [];
  const pageSize = 500;
  for (let offset = 0; ; offset += pageSize) {
    let query = supabase.from(table).select('*').eq('trader_id', traderId);
    if (table === 'trade_logs') query = query.not('event_id', 'is', null);
    const { data, error } = await query.order(order, { ascending: true }).range(offset, offset + pageSize - 1);
    if (error) throw error;
    result.push(...(data || []));
    if (!data || data.length < pageSize) return result;
  }
}

async function rebuild() {
  const { data: states, error } = await supabase.from('trader_simulation_state').select('trader_id, config');
  if (error) throw error;
  let rebuilt = 0;
  for (const state of states || []) {
    const [trades, snapshots] = await Promise.all([
      rows('trade_logs', state.trader_id, 'traded_at'),
      rows('synthetic_equity_snapshots', state.trader_id, 'snapshot_at'),
    ]);
    const metrics = calculateSyntheticMetrics({
      startingEquity: Number(state.config?.startingEquity) || 100000,
      trades,
      snapshots,
    });
    const { error: updateError } = await supabase.from('traders').update({ ...metrics, updated_at: new Date().toISOString() }).eq('id', state.trader_id);
    if (updateError) throw updateError;
    rebuilt++;
  }
  console.log(`Rebuilt derived metrics for ${rebuilt} traders from trades and equity snapshots.`);
}

rebuild().catch((error) => { console.error(error); process.exit(1); });

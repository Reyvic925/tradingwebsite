import 'dotenv/config.js';
import { spawn } from 'node:child_process';
import { createClient } from '@supabase/supabase-js';

const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
if (!url || !key) throw new Error('Missing VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
const supabase = createClient(url, key);

async function countRows(table, traderId, filterEvent = false) {
  let query = supabase.from(table).select('id', { count: 'exact', head: true }).eq('trader_id', traderId);
  if (filterEvent) query = query.not('event_id', 'is', null);
  const { count, error } = await query;
  if (error) throw error;
  return count || 0;
}

async function needsBootstrap(trader) {
  const [snapshots, trades, largestTrade] = await Promise.all([
    countRows('synthetic_equity_snapshots', trader.id),
    countRows('trade_logs', trader.id, true),
    supabase.from('trade_logs').select('quantity, pnl').eq('trader_id', trader.id).not('event_id', 'is', null).order('quantity', { ascending: false }).limit(1),
  ]);
  if (largestTrade.error) throw largestTrade.error;
  const largest = largestTrade.data?.[0];
  return snapshots < 90 || trades < 200 || Number(largest?.quantity) > 1_000_000 || Math.abs(Number(largest?.pnl)) > 100_000_000;
}

async function main() {
  const { data: traders, error } = await supabase.from('traders').select('id, name, is_active').order('id');
  if (error) throw error;
  const missing = [];
  for (const trader of traders || []) {
    if (await needsBootstrap(trader)) missing.push(trader.name);
  }
  console.log(`Inspected ${traders?.length || 0} traders; ${missing.length} require bootstrap.`);
  if (!missing.length) {
    console.log('Existing synthetic history is sufficient; no rows replaced.');
    return;
  }
  console.log('Rebuilding deterministic history for the roster so all traders share the current sizing model.');
  await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['scripts/backfill-trader-history.mjs'], { stdio: 'inherit', env: process.env });
    child.on('error', reject);
    child.on('exit', (code) => code === 0 ? resolve() : reject(new Error(`History bootstrap exited with code ${code}`)));
  });
}

main().catch((error) => { console.error(error); process.exit(1); });

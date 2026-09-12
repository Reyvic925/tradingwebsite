import 'dotenv/config.js';
import { createClient } from '@supabase/supabase-js';
import { normalizeSyntheticConfig } from '../api-handlers/synthetic-simulation.js';

const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
if (!url || !key) throw new Error('Missing VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
const supabase = createClient(url, key);

function classify(trader) {
  const text = `${trader.name} ${trader.bio || ''} ${trader.specialty || ''}`.toLowerCase();
  if (/martingale/.test(text)) return 'martingale';
  if (/scalp|high-frequency|high frequency/.test(text)) return 'scalper';
  if (/mean reversion/.test(text)) return 'mean_reversion';
  if (/swing/.test(text)) return 'swing';
  if (/conservative|capital preservation|low-risk|low risk|risk-aware|steady|stable|measured/.test(text)) return 'conservative';
  return 'momentum';
}

function targetFor(trader, strategyType) {
  const risk = Math.max(1, Number(trader.risk_score) || 5);
  const base = {
    conservative: 24,
    swing: 38,
    momentum: 55,
    scalper: 70,
    martingale: 120,
    mean_reversion: 32,
  }[strategyType] || 55;
  return Number((base * (0.75 + risk * 0.08)).toFixed(2));
}

async function backfill() {
  const { data: traders, error: tradersError } = await supabase.from('traders').select('id, name, bio, specialty, risk_score');
  if (tradersError) throw tradersError;
  let updated = 0;
  const failures = [];
  for (const trader of traders || []) {
    let lastError;
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      const { data: row, error } = await supabase.from('trader_simulation_state').select('config').eq('trader_id', trader.id).maybeSingle();
      if (error) {
        lastError = error;
        continue;
      }
      if (!row) break;
      const strategyType = classify(trader);
      const existingTarget = Number(row.config?.targetReturnProfile);
      const targetReturnProfile = Number.isFinite(existingTarget) && existingTarget !== 0
        ? existingTarget
        : targetFor(trader, strategyType);
      const config = normalizeSyntheticConfig({ ...row.config, strategyType, riskProfile: trader.risk_score, targetReturnProfile, riskFraction: undefined });
      const { error: updateError } = await supabase.from('trader_simulation_state').update({ config, updated_at: new Date().toISOString() }).eq('trader_id', trader.id);
      if (!updateError) {
        updated++;
        console.log(`${trader.name}: ${strategyType}`);
        lastError = null;
        break;
      }
      lastError = updateError;
    }
    if (lastError) failures.push({ trader: trader.name, error: lastError.message });
  }
  console.log(`Backfilled ${updated} simulation profiles without resetting state or metrics.`);
  if (failures.length) {
    console.error('Profile backfill failures:', failures);
    process.exitCode = 2;
  }
}

backfill().catch((error) => { console.error(error); process.exit(1); });
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
  const name = String(trader.name || '').toLowerCase();
  if (name === 'apex traders') return 420;
  if (name === 'ingrid martingale') return 380;
  if (name === 'victor mensah') return 320;
  const base = {
    conservative: 18,
    swing: 35,
    momentum: 42,
    scalper: 58,
    martingale: 180,
    mean_reversion: 28,
  }[strategyType] || 55;
  return Number(Math.min(240, base * (0.7 + risk * 0.06)).toFixed(2));
}

function shouldCompound(trader, strategyType, targetReturnProfile) {
  const name = String(trader.name || '').toLowerCase();
  return strategyType === 'martingale'
    || name === 'apex traders'
    || name === 'ingrid martingale'
    || name === 'victor mensah'
    || (strategyType === 'momentum' && targetReturnProfile >= 180);
}

function leverageFor(strategyType, targetReturnProfile) {
  if (strategyType === 'conservative') return 2;
  if (strategyType === 'swing') return 3;
  if (strategyType === 'scalper') return 4;
  if (strategyType === 'martingale' || targetReturnProfile >= 300) return 8;
  return 5;
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
      const targetReturnProfile = targetFor(trader, strategyType);
      const config = normalizeSyntheticConfig({
        ...row.config,
        strategyType,
        riskProfile: trader.risk_score,
        targetReturnProfile,
        riskFraction: undefined,
        compounding: shouldCompound(trader, strategyType, targetReturnProfile),
        maxLeverage: leverageFor(strategyType, targetReturnProfile),
      });
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
import 'dotenv/config.js';
import { createClient } from '@supabase/supabase-js';
import { normalizeSyntheticConfig } from '../api-handlers/synthetic-simulation.js';

const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
if (!url || !key) throw new Error('Missing VITE_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
const supabase = createClient(url, key);

const classify = (trader) => {
  const text = `${trader.name} ${trader.bio || ''} ${trader.specialty || ''}`.toLowerCase();
  if (/martingale/.test(text)) return 'martingale';
  if (text.includes('scalp')) return 'scalper';
  if (text.includes('mean reversion')) return 'mean_reversion';
  if (text.includes('swing')) return 'swing';
  if (/conservative|capital preservation|low-risk|low risk|risk-aware|steady|stable|measured/.test(text)) return 'conservative';
  return 'momentum';
};

async function migrate() {
  const { data: traders, error } = await supabase.from('traders').select('*');
  if (error) throw error;
  let migrated = 0;
  for (const trader of traders || []) {
    const { data: existingState, error: existingStateError } = await supabase
      .from('trader_simulation_state')
      .select('config')
      .eq('trader_id', trader.id)
      .maybeSingle();
    if (existingStateError) throw existingStateError;
    if (existingState) {
      console.log(`Skipping ${trader.name}: simulation state already exists.`);
      continue;
    }
    const targetReturn = Number(trader.total_return) || 0;
    const config = normalizeSyntheticConfig({
      strategyType: classify(trader),
      assetClass: trader.asset_class || (Array.isArray(trader.asset_focus) && trader.asset_focus.length > 1 ? 'multi_asset' : 'crypto'),
      assets: trader.asset_focus,
      session: trader.session_type,
      startingEquity: 100000,
      targetReturnProfile: targetReturn,
      targetWinRate: Number(trader.win_rate_trades) > 0 ? Number(trader.win_rate_trades) / 100 : 0.575,
      riskProfile: trader.risk_score,
      compounding: targetReturn > 100,
      maxLeverage: targetReturn > 1000 ? 10 : targetReturn > 100 ? 5 : 3,
    });
    const state = {
      equity: config.startingEquity,
      peakEquity: config.startingEquity,
      prices: {},
      lossStreak: 0,
      tickIndex: 0,
      lastProcessedAt: null,
    };
    const { error: stateError } = await supabase.from('trader_simulation_state').upsert({
      trader_id: trader.id,
      seed: `trader-${trader.id}`,
      config: { ...config, targetReturnProfile: targetReturn },
      state,
      tick_index: 0,
      last_processed_at: null,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'trader_id' });
    if (stateError) throw stateError;
    await supabase.from('traders').update({
      current_equity: config.startingEquity,
      total_return: 0,
      daily_return: 0,
      total_trades: 0,
      win_rate_trades: 0,
      max_drawdown: 0,
      volatility: 0,
      updated_at: new Date().toISOString(),
    }).eq('id', trader.id);
    migrated++;
  }
  console.log(`Migrated ${migrated} traders. Existing ROI values were retained only as targetReturnProfile configuration.`);
}

migrate().catch((error) => { console.error(error); process.exit(1); });

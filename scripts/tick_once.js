import supabase from '../api-handlers/db-client.js';
import { applyTick, fillPendingLimits } from '../api-handlers/markets.js';
import { insertPriceHistory } from '../api-handlers/admin-helpers.js';

async function runOnce() {
  try {
    const { data: markets, error } = await supabase.from('markets').select('id, asset_class, price, change_24h, high_24h, low_24h, hidden_drift, volatility').limit(1);
    if (error) throw error;
    if (!markets || markets.length === 0) {
      console.error('No markets found to tick');
      process.exit(2);
    }
    const m = markets[0];
    console.log('Ticking market', m.id, m.symbol || '');

    const u = applyTick(m);

    const open = Number(m.price);
    const close = Number(u.price);
    const high = Math.max(Number(m.high_24h || open), open, close);
    const low = Math.min(Number(m.low_24h || open), open, close);

    // Update market
    const { error: upErr } = await supabase.from('markets').update({ price: close, change_24h: u.change_24h, high_24h: high, low_24h: low }).eq('id', m.id);
    if (upErr) throw upErr;

    // Insert price history
    const ts = new Date().toISOString();
    const { data: ph, error: phErr } = await insertPriceHistory(m.id, open, high, low, close, 0, ts, { source: 'script' });
    if (phErr) throw phErr;

    console.log('Inserted price_history id:', ph?.id || (ph && ph[0] && ph[0].id) || 'unknown');

    // Verify insertion
    const { data: rows, error: qErr } = await supabase.from('price_history').select('*').eq('market_id', m.id).order('ts', { ascending: false }).limit(3);
    if (qErr) throw qErr;
    console.log('Recent price_history rows for market:', rows || []);

    // Try filling pending limits for this market
    await fillPendingLimits([ { id: m.id, asset_class: m.asset_class, price: close, change_24h: u.change_24h, high_24h: high, low_24h: low } ]);

    console.log('Tick run complete');
    process.exit(0);
  } catch (err) {
    console.error('Tick run failed:', err);
    process.exit(1);
  }
}

runOnce();
import supabase from './db-client.js';
import { fillPendingLimits, applyTick } from './markets.js';
import { insertPriceHistory } from './admin-helpers.js';

// Cron endpoint: /api/cron/tick
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Cron-Secret');
  if (req.method === 'OPTIONS') return res.status(204).end();

  try {
    // Validate secret presence and match
    const secret = process.env.CRON_SECRET;
    const provided = (req.headers['x-cron-secret'] || req.query?.cron_secret || '').toString();
    if (!secret) {
      return res.status(500).json({ error: 'Server misconfigured: CRON_SECRET not set. Set CRON_SECRET in your environment before calling this endpoint.' });
    }
    if (provided !== secret) {
      return res.status(401).json({ error: 'Invalid cron secret' });
    }

    // Fetch markets to tick (include admin tunables hidden_drift and volatility)
    const { data: allMarkets, error: mErr } = await supabase.from('markets').select('id, asset_class, price, change_24h, high_24h, low_24h, hidden_drift, volatility').limit(1000);
    if (mErr) throw mErr;
    const pool = allMarkets || [];

    // Sample up to N markets to update per run to avoid heavy writes
    const N = Math.min(120, pool.length);
    const sample = [];
    const used = new Set();
    while (sample.length < N && used.size < pool.length) {
      const i = Math.floor(Math.random() * pool.length);
      if (used.has(i)) continue;
      used.add(i);
      sample.push(pool[i]);
    }

    // Apply ticks and collect updates and price history inserts
    const updates = [];
    const phWrites = [];

    for (const m of sample) {
      try {
        // compute new tick using markets.applyTick which respects per-market volatility and hidden_drift
        const u = applyTick(m);
n        const open = Number(m.price);
        const close = Number(u.price);
        const high = Math.max(Number(m.high_24h || open), open, close);
        const low = Math.min(Number(m.low_24h || open), open, close);
n        updates.push({ id: m.id, price: close, change_24h: u.change_24h, high_24h: high, low_24h: low });
        phWrites.push({ market_id: m.id, o: open, h: high, l: low, c: close, volume: 0, ts: new Date().toISOString() });
      } catch (e) {
        console.error('[cron] tick apply failed for market', m?.id, e?.message || e);
      }
    }

    // Perform batched updates to markets
    await Promise.all(updates.map((u) => supabase.from('markets').update({ price: u.price, change_24h: u.change_24h, high_24h: u.high_24h, low_24h: u.low_24h }).eq('id', u.id)));

    // Insert price_history rows
    for (const p of phWrites) {
      try {
        await insertPriceHistory(p.market_id, p.o, p.h, p.l, p.c, p.volume, p.ts, { source: 'cron' });
      } catch (e) {
        console.error('[cron] insertPriceHistory failed', e?.message || e);
      }
    }

    // Trigger pending limit fills using markets snapshot of updated markets
    const updatedMarkets = await Promise.all(updates.map(async (u) => {
      const { data } = await supabase.from('markets').select('id, asset_class, price, change_24h, high_24h, low_24h').eq('id', u.id).limit(1).maybeSingle();
      return data;
    }));

    await fillPendingLimits(updatedMarkets.filter(Boolean));

    return res.status(200).json({ ok: true, updated: updates.length });
  } catch (err) {
    console.error('[cron] error', err);
    return res.status(500).json({ error: String(err?.message || err) });
  }
}

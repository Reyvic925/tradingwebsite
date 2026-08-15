import supabase from './db-client.js';
import { fillPendingLimits, applyTick } from './markets.js';
import { insertPriceHistory } from './admin-helpers.js';
import { fetchLiveMarketSnapshot, blendLiveQuote } from './live-market-data.js';

// Cron endpoint: /api/cron/tick
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Cron-Secret');
  if (req.method === 'OPTIONS') return res.status(204).end();

  try {
    const secret = process.env.CRON_SECRET;
    const provided = (req.headers['x-cron-secret'] || req.query?.cron_secret || '').toString();
    if (!secret) {
      return res.status(500).json({ error: 'Server misconfigured: CRON_SECRET not set. Set CRON_SECRET in your environment before calling this endpoint.' });
    }
    if (provided !== secret) {
      return res.status(401).json({ error: 'Invalid cron secret' });
    }

    const liveMap = await fetchLiveMarketSnapshot().catch(() => ({}));
    const { data: allMarkets, error: mErr } = await supabase.from('markets').select('id, asset_class, price, change_24h, high_24h, low_24h, hidden_drift, volatility').limit(1000);
    if (mErr) throw mErr;
    const pool = allMarkets || [];

    const N = Math.min(120, pool.length);
    const sample = [];
    const used = new Set();
    while (sample.length < N && used.size < pool.length) {
      const i = Math.floor(Math.random() * pool.length);
      if (used.has(i)) continue;
      used.add(i);
      sample.push(pool[i]);
    }

    const updates = [];
    const phWrites = [];

    for (const m of sample) {
      try {
        const liveQuote = liveMap[String(m.symbol).toUpperCase()];
        const blended = liveQuote ? blendLiveQuote(m, liveQuote) : m;
        const u = applyTick({ ...m, ...blended });
        const open = Number(m.price);
        const close = Number(u.price);
        const high = Math.max(Number(m.high_24h || open), open, close);
        const low = Math.min(Number(m.low_24h || open), open, close);

        updates.push({ id: m.id, price: close, change_24h: u.change_24h, high_24h: high, low_24h: low });
        phWrites.push({ market_id: m.id, o: open, h: high, l: low, c: close, volume: 0, ts: new Date().toISOString() });
      } catch (e) {
        console.error('[cron] tick apply failed for market', m?.id, e?.message || e);
      }
    }

    await Promise.all(updates.map((u) => supabase.from('markets').update({ price: u.price, change_24h: u.change_24h, high_24h: u.high_24h, low_24h: u.low_24h }).eq('id', u.id)));

    for (const p of phWrites) {
      try {
        await insertPriceHistory(p.market_id, p.o, p.h, p.l, p.c, p.volume, p.ts, { source: 'cron' });
      } catch (e) {
        console.error('[cron] insertPriceHistory failed', e?.message || e);
      }
    }

    const { data: activeInvestments, error: invErr } = await supabase.from('investments').select('*').eq('status', 'active');
    if (invErr) throw invErr;

    const { data: planRows } = await supabase.from('plans').select('*');
    const plansById = Object.fromEntries((planRows || []).map((plan) => [String(plan.id), plan]));

    for (const investment of activeInvestments || []) {
      const plan = plansById[String(investment.plan_id)];
      if (!plan) continue;

      const amount = Number(investment.amount || 0);
      const durationDays = Math.max(1, Number(plan.duration_days || 1));
      const totalReturn = Number(plan.total_return || 0) / 100;
      const start = new Date(investment.start_date).getTime();
      const elapsedDays = Math.min(durationDays, Math.max(0, Math.floor((Date.now() - start) / 86400000)));
      const progress = Math.min(1, elapsedDays / durationDays);
      const variance = (Math.random() * 2 - 1) * 0.18;
      const earned = amount * totalReturn * progress * (1 + variance);
      const status = elapsedDays >= durationDays ? 'completed' : 'active';

      await supabase.from('investments').update({
        earned: Math.max(0, Number(earned.toFixed(2))),
        status,
      }).eq('id', investment.id);

      if (status === 'completed') {
        const wallet = await supabase.from('wallets').select('*').eq('user_id', investment.user_id).limit(1).maybeSingle();
        const payout = amount + Number(earned.toFixed(2));
        if (wallet.data) {
          await supabase.from('wallets').update({ available: Number(wallet.data.available || 0) + payout }).eq('id', wallet.data.id);
        }
        await supabase.from('transactions').insert({
          user_id: investment.user_id,
          type: 'investment_payout',
          amount: payout,
          currency: 'USD',
          method: 'plan',
          status: 'completed',
          reference: `INV-${investment.id}`,
        });
      }
    }

    const updatedMarkets = await Promise.all(updates.map(async (u) => {
      const { data } = await supabase.from('markets').select('id, asset_class, price, change_24h, high_24h, low_24h').eq('id', u.id).limit(1).maybeSingle();
      return data;
    }));

    await fillPendingLimits(updatedMarkets.filter(Boolean));

    return res.status(200).json({ ok: true, updated: updates.length, investment_updates: activeInvestments?.length || 0 });
  } catch (err) {
    console.error('[cron] error', err);
    return res.status(500).json({ error: String(err?.message || err) });
  }
}

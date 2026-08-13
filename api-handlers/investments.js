import supabase from './db-client.js';
import { getUsdWallet, first, findById, requireUser as authUser } from './helpers.js';

async function requireUser(req) {
  return authUser(supabase, req);
}

function accrue(inv, plan) {
  if (inv.status !== 'active') return inv;
  const start = new Date(inv.start_date).getTime();
  const now = Date.now();
  const days = Math.min(plan.duration_days, Math.floor((now - start) / 86400000));
  const earned = Number(inv.amount) * (Number(plan.daily_rate) / 100) * days;
  const ended = days >= plan.duration_days;
  return { ...inv, earned, days_elapsed: days, status: ended ? 'completed' : 'active' };
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(204).end();

  try {
    const user = await requireUser(req);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    if (req.method === 'GET') {
      const { data: investments, error } = await supabase
        .from('investments')
        .select('*')
        .eq('user_id', user.id)
        .order('id', { ascending: false });
      if (error) throw error;
      const { data: plans } = await supabase.from('plans').select('*');
      const byId = Object.fromEntries((plans || []).map((p) => [p.id, p]));
      const out = [];
      for (const inv of investments || []) {
        const plan = byId[inv.plan_id];
        if (!plan) {
          out.push(inv);
          continue;
        }
        const next = accrue(inv, plan);
        if (next.earned !== Number(inv.earned) || next.status !== inv.status) {
          if (next.status === 'completed' && inv.status !== 'completed') {
            const payout = Number(inv.amount) + Number(next.earned);
            const wallet = await getUsdWallet(supabase, user.id);
            if (wallet) {
              await supabase.from('wallets').update({ available: Number(wallet.available) + payout }).eq('id', wallet.id);
            }
            await supabase.from('transactions').insert({
              user_id: user.id,
              type: 'investment_payout',
              amount: payout,
              currency: 'USD',
              method: 'plan',
              status: 'completed',
              reference: `INV-${inv.id}`,
            });
            await supabase.from('notifications').insert({
              user_id: user.id,
              title: `${plan.name} plan matured`,
              body: `Payout of $${payout.toFixed(2)} credited to your wallet.`,
              read: false,
            });
          }
          await supabase.from('investments').update({ earned: next.earned, status: next.status }).eq('id', inv.id);
        }
        out.push({ ...next, plan });
      }
      return res.status(200).json(out);
    }

    if (req.method === 'POST') {
      const { plan_id, amount } = req.body || {};
      const amt = Number(amount);
      if (!plan_id || !(amt > 0)) return res.status(400).json({ error: 'Invalid plan or amount' });

      const plan = await findById(supabase, 'plans', plan_id);
      if (!plan) return res.status(400).json({ error: 'Unknown plan' });
      if (amt < Number(plan.min_amount)) return res.status(400).json({ error: `Minimum is $${plan.min_amount}` });
      if (plan.max_amount != null && amt > Number(plan.max_amount)) {
        return res.status(400).json({ error: `Maximum is $${plan.max_amount}` });
      }

      const wallet = await getUsdWallet(supabase, user.id);
      if (!wallet || Number(wallet.available) < amt) return res.status(400).json({ error: 'Insufficient balance' });

      await supabase.from('wallets').update({ available: Number(wallet.available) - amt }).eq('id', wallet.id);

      const start = new Date();
      const end = new Date(start.getTime() + plan.duration_days * 86400000);
      const { data, error } = await supabase
        .from('investments')
        .insert({
          user_id: user.id,
          plan_id,
          plan_name: plan.name,
          amount: amt,
          daily_rate: plan.daily_rate,
          duration_days: plan.duration_days,
          start_date: start.toISOString(),
          end_date: end.toISOString(),
          status: 'active',
          earned: 0,
        })
        .select();
      if (error) throw error;
      const created = first(data);

      await supabase.from('transactions').insert({
        user_id: user.id,
        type: 'investment',
        amount: amt,
        currency: 'USD',
        method: 'wallet',
        status: 'completed',
        reference: `INV-${created.id}`,
      });

      await supabase.from('notifications').insert({
        user_id: user.id,
        title: `Subscribed to ${plan.name}`,
        body: `$${amt.toFixed(2)} allocated for ${plan.duration_days} days at ${plan.daily_rate}% daily.`,
        read: false,
      });

      return res.status(201).json({ ...created, plan });
    }

    res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('API error:', err);
    res.status(500).json({ error: err.message });
  }
}

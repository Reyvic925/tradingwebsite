import supabase from './db-client.js';
import { createNotification } from './notification-service.js';
import { getUsdWallet, first, findById, requireUser as authUser } from './helpers.js';

async function requireUser(req) {
  return authUser(supabase, req);
}

export function computePlanProgress(inv, plan) {
  if (inv.status !== 'active') return { ...inv, earned: Number(inv.earned || 0), days_elapsed: Number(inv.days_elapsed || 0), status: inv.status || 'active' };

  const amount = Number(inv.amount || 0);
  const totalReturn = Number(plan.total_return || 0) / 100;
  const durationDays = Math.max(1, Number(plan.duration_days || 1));
  const start = new Date(inv.start_date).getTime();
  const now = Date.now();
  const elapsedDays = Math.min(durationDays, Math.max(0, Math.floor((now - start) / 86400000)));
  const progress = Math.min(1, elapsedDays / durationDays);
  const earned = amount * totalReturn * progress;
  const ended = elapsedDays >= durationDays;

  return { ...inv, earned, days_elapsed: elapsedDays, status: ended ? 'completed' : 'active' };
}

export function simulateInvestmentStep(inv, plan) {
  const amount = Number(inv.amount || 0);
  const totalReturn = Number(plan.total_return || 0) / 100;
  const durationDays = Math.max(1, Number(plan.duration_days || 1));
  const start = new Date(inv.start_date).getTime();
  const elapsedDays = Math.min(durationDays, Math.max(0, Math.floor((Date.now() - start) / 86400000)));
  const progress = Math.min(1, elapsedDays / durationDays);
  const swing = (Math.random() * 2 - 1) * 0.25;
  const earned = amount * totalReturn * progress * (1 + swing);
  const signed = Math.random() > 0.5 ? 1 : -1;
  const realized = amount * totalReturn * progress + (amount * (totalReturn * 0.18) * signed * (1 - progress));
  return {
    earned: Math.max(-amount, Math.min(amount * (totalReturn * 1.2), Number.isFinite(realized) ? realized : earned)),
    days_elapsed: elapsedDays,
    status: elapsedDays >= durationDays ? 'completed' : 'active',
  };
}

function accrue(inv, plan) {
  return computePlanProgress(inv, plan);
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
      const requestedId = req.query?.id;
      if (requestedId) {
        const { data: investment, error: investmentError } = await supabase
          .from('investments')
          .select('*')
          .eq('id', requestedId)
          .eq('user_id', user.id)
          .maybeSingle();
        if (investmentError) throw investmentError;
        if (!investment) return res.status(404).json({ error: 'Investment not found' });

        const [{ data: tier }, { data: plan }, { data: transactions }, { data: withdrawals }, { data: profile }] = await Promise.all([
          investment.tier_id
            ? supabase.from('investment_tiers').select('*').eq('id', investment.tier_id).maybeSingle()
            : Promise.resolve({ data: null }),
          investment.plan_id
            ? supabase.from('plans').select('*').eq('id', investment.plan_id).maybeSingle()
            : Promise.resolve({ data: null }),
          supabase.from('investment_transactions').select('*').eq('investment_id', investment.id).order('created_at', { ascending: true }),
          supabase.from('withdrawals').select('status').eq('investment_id', investment.id).eq('user_id', user.id),
          supabase.from('profiles').select('tier, locked_balance').eq('user_id', user.id).maybeSingle(),
        ]);

        return res.status(200).json({
          investment: { ...investment, tier_details: tier, plan },
          transactions: transactions || [],
          userTier: profile?.tier || tier?.name || plan?.name || investment.plan_name || 'Member',
          lockedBalance: Number(profile?.locked_balance || 0),
          withdrawalPending: (withdrawals || []).some((withdrawal) => withdrawal.status === 'pending'),
        });
      }

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
            await createNotification(supabase, {
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

      await createNotification(supabase, {
        user_id: user.id,
        title: `Subscribed to ${plan.name}`,
        body: `$${amt.toFixed(2)} allocated for ${plan.duration_days} days with a ${plan.total_return}% total-return target.`,
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

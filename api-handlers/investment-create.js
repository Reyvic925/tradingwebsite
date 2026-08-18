import supabase from './db-client.js';
import { getUsdWallet, requireUser as authUser, first } from './helpers.js';
import { createNotification } from './notification-service.js';

async function requireUser(req) {
  return authUser(supabase, req);
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(204).end();

  try {
    const user = await requireUser(req);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    // GET a user's investments. Supplying ?id= returns the complete ledger for
    // one investment, which powers the Invest detail screen without a portfolio
    // endpoint.
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

        const [{ data: tier }, { data: transactions }, { data: withdrawals }, { data: profile }] = await Promise.all([
          supabase.from('investment_tiers').select('*').eq('id', investment.tier_id).maybeSingle(),
          supabase.from('investment_transactions').select('*').eq('investment_id', investment.id).order('created_at', { ascending: true }),
          supabase.from('withdrawals').select('status').eq('investment_id', investment.id).eq('user_id', user.id),
          supabase.from('profiles').select('tier, locked_balance').eq('user_id', user.id).maybeSingle(),
        ]);

        return res.status(200).json({
          investment: { ...investment, tier_details: tier },
          transactions: transactions || [],
          userTier: profile?.tier || 'Member',
          lockedBalance: Number(profile?.locked_balance || 0),
          withdrawalPending: (withdrawals || []).some((withdrawal) => withdrawal.status === 'pending'),
        });
      }

      const { data: investments } = await supabase
        .from('investments')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      const { data: tiers } = await supabase.from('investment_tiers').select('*');
      const tiersById = Object.fromEntries((tiers || []).map((t) => [t.id, t]));

      const investments_with_details = (investments || []).map((inv) => ({
        ...inv,
        tier_details: tiersById[inv.tier_id],
      }));

      return res.status(200).json(investments_with_details);
    }

    // POST create investment
    if (req.method === 'POST') {
      const { tier_id, amount } = req.body || {};
      if (!tier_id || !amount) return res.status(400).json({ error: 'Missing tier_id or amount' });

      const amt = Number(amount);
      if (amt <= 0) return res.status(400).json({ error: 'Invalid amount' });

      // Get tier details
      const { data: tierRows } = await supabase.from('investment_tiers').select('*').eq('id', tier_id).limit(1);
      const tier = first(tierRows);
      if (!tier) return res.status(404).json({ error: 'Tier not found' });

      // Validate amount within tier limits
      if (amt < Number(tier.min_investment)) return res.status(400).json({ error: `Minimum investment is $${tier.min_investment}` });
      if (amt > Number(tier.max_investment)) return res.status(400).json({ error: `Maximum investment is $${tier.max_investment}` });

      // Check available balance
      const wallet = await getUsdWallet(supabase, user.id);
      if (!wallet || Number(wallet.available) < amt) {
        return res.status(400).json({ error: 'Insufficient available balance' });
      }

      // Deduct from available balance
      await supabase.from('wallets').update({
        available: Number(wallet.available) - amt,
        reserved: Number(wallet.reserved || 0),
      }).eq('id', wallet.id);

      // Create investment
      const now = new Date();
      const endDate = new Date(now.getTime() + tier.duration_days * 86400000);
      const { data: invData } = await supabase.from('investments').insert({
        user_id: user.id,
        tier_id: tier.id,
        plan_name: tier.name,
        amount: amt,
        current_value: amt,
        duration_days: tier.duration_days,
        start_date: now.toISOString(),
        end_date: endDate.toISOString(),
        status: 'active',
        earned: 0,
        days_elapsed: 0,
      }).select();

      const investment = first(invData);

      // Log transaction
      await supabase.from('transactions').insert({
        user_id: user.id,
        type: 'investment',
        amount: amt,
        currency: 'USD',
        method: 'wallet',
        status: 'completed',
        reference: `INV-${investment.id}`,
      });

      // Log gain entry
      await supabase.from('investment_transactions').insert({
        investment_id: investment.id,
        user_id: user.id,
        type: 'deposit',
        amount: amt,
        description: `Initial investment of $${amt} in ${tier.name} tier (${tier.duration_days} days)`,
      });

      // Upgrade user tier if necessary
      const { data: profileData } = await supabase.from('profiles').select('tier').eq('user_id', user.id).limit(1);
      const profile = first(profileData);
      const tierOrder = ['Starter', 'Silver', 'Gold', 'Platinum', 'Diamond'];
      const currentTierIdx = tierOrder.indexOf(profile?.tier || 'Starter');
      const newTierIdx = tierOrder.indexOf(tier.name);
      if (newTierIdx > currentTierIdx) {
        await supabase.from('profiles').update({ tier: tier.name }).eq('user_id', user.id);
      }

      // Notification
      await createNotification(supabase, {
        user_id: user.id,
        title: `Investment created in ${tier.name} tier`,
        body: `Invested $${amt} for ${tier.duration_days} days with ${tier.percent_return}% target return.`,
        read: false,
      });

      return res.status(201).json({ ...investment, tier_details: tier });
    }

    res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('[investment-create] error', err);
    return res.status(500).json({ error: String(err?.message || err) });
  }
}

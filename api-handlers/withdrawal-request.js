import supabase from './db-client.js';
import { requireUser as authUser, getUsdWallet, first } from './helpers.js';
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

    // GET pending withdrawals for user
    if (req.method === 'GET') {
      const { data } = await supabase
        .from('withdrawals')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      return res.status(200).json(data || []);
    }

    // POST initiate withdrawal
    if (req.method === 'POST') {
      const { type = 'regular', investment_id, amount, currency = 'USD' } = req.body || {};
      const amt = Number(amount);

      if (!type || !amt || amt <= 0) {
        return res.status(400).json({ error: 'Invalid withdrawal request' });
      }

      // Regular withdrawal: from availableBalance
      if (type === 'regular') {
        const wallet = await getUsdWallet(supabase, user.id);
        if (!wallet || Number(wallet.available) < amt) {
          return res.status(400).json({ error: 'Insufficient available balance' });
        }

        const { data } = await supabase.from('withdrawals').insert({
          user_id: user.id,
          type: 'regular',
          amount: amt,
          currency,
          status: 'pending',
          fee_stage: 'awaiting_activation_fee',
          deducted_from_available: true,
        }).select();

        // Deduct from available immediately
        await supabase.from('wallets').update({
          available: Number(wallet.available) - amt,
        }).eq('id', wallet.id);

        await createNotification(supabase, {
          user_id: user.id,
          title: 'Withdrawal initiated',
          body: `Withdrawal of ${amt} ${currency} initiated. Awaiting approval.`,
          read: false,
        });

        return res.status(201).json(first(data));
      }

      // ROI withdrawal: from lockedBalance
      if (type === 'roi') {
        if (!investment_id) return res.status(400).json({ error: 'investment_id required for ROI withdrawal' });

        // Get investment
        const { data: invRows } = await supabase.from('investments').select('*').eq('id', investment_id).limit(1);
        const investment = first(invRows);
        if (!investment || investment.user_id !== user.id) {
          return res.status(404).json({ error: 'Investment not found' });
        }

        // Check lockedBalance
        const { data: profiles } = await supabase.from('profiles').select('locked_balance').eq('user_id', user.id).limit(1);
        const profile = first(profiles);
        const lockedBalance = Number(profile?.locked_balance || 0);

        if (lockedBalance < amt) {
          return res.status(400).json({ error: `Insufficient locked balance. Available: $${lockedBalance}` });
        }

        const { data } = await supabase.from('withdrawals').insert({
          user_id: user.id,
          investment_id,
          type: 'roi',
          amount: amt,
          currency,
          status: 'pending',
          fee_stage: 'awaiting_activation_fee',
          from_locked_balance: true,
        }).select();

        // Deduct from locked balance
        await supabase.from('profiles').update({
          locked_balance: lockedBalance - amt,
        }).eq('user_id', user.id);

        await createNotification(supabase, {
          user_id: user.id,
          title: 'ROI withdrawal initiated',
          body: `ROI withdrawal of $${amt} initiated. Awaiting admin approval.`,
          read: false,
        });

        return res.status(201).json(first(data));
      }

      return res.status(400).json({ error: 'Invalid withdrawal type' });
    }

    res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('[withdrawal-request] error', err);
    return res.status(500).json({ error: String(err?.message || err) });
  }
}

import supabase from './db-client.js';
import { requireAdmin } from './auth-admin.js';
import { logAdminAction } from './admin-helpers.js';
import { creditReferralDeposit } from './referral-rewards.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Admin-Secret');
  if (req.method === 'OPTIONS') return res.status(204).end();

  try {
    const adminAuth = await requireAdmin(req);
    if (!adminAuth) return res.status(403).json({ error: 'Forbidden' });
    const adminUser = adminAuth.admin || null;

    if (req.method === 'GET') {
      const { status = 'pending', limit = 200, offset = 0 } = req.query || {};
      let q = supabase.from('deposits').select('*');
      if (status && status !== 'all') q = q.eq('status', status);

      const { data, error } = await q
        .order('created_at', { ascending: false })
        .range(Number(offset || 0), Number(offset || 0) + Number(limit || 200) - 1);
      if (error) throw error;

      const deposits = data || [];
      const userIds = [...new Set(deposits.map((row) => row.user_id).filter(Boolean))];
      let profileMap = new Map();
      if (userIds.length) {
        const { data: profiles, error: profileError } = await supabase
          .from('profiles')
          .select('user_id, email, full_name')
          .in('user_id', userIds);
        if (profileError) throw profileError;
        profileMap = new Map((profiles || []).map((profile) => [profile.user_id, profile]));
      }

      return res.status(200).json({
        deposits: deposits.map((row) => ({
          ...row,
          user_email: profileMap.get(row.user_id)?.email || null,
          user_name: profileMap.get(row.user_id)?.full_name || null,
        })),
      });
    }

    if (req.method === 'POST') {
      const { depositId, admin_notes = '', credited_amount, chain_amount } = req.body || {};
      if (!depositId) return res.status(400).json({ error: 'depositId is required' });

      const { data: rows, error: fetchErr } = await supabase
        .from('deposits')
        .select('*')
        .eq('id', depositId)
        .limit(1);
      if (fetchErr) throw fetchErr;
      const existing = rows?.[0];
      if (!existing) return res.status(404).json({ error: 'Deposit not found' });
      if (existing.status !== 'pending') return res.status(400).json({ error: `Deposit is already ${existing.status}` });

      const amountToCredit = Number(credited_amount ?? chain_amount ?? existing.amount);
      if (!Number.isFinite(amountToCredit) || Number(amountToCredit) <= 0) {
        return res.status(400).json({ error: 'credited_amount must be a positive number' });
      }

      const { data: updated, error: updateErr } = await supabase
        .from('deposits')
        .update({
          status: 'confirmed',
          confirmed_at: new Date().toISOString(),
          admin_notes: admin_notes || '',
          amount: Number(amountToCredit),
        })
        .eq('id', depositId)
        .select();
      if (updateErr) throw updateErr;

      const preferredCurrency = existing.currency === 'USD' ? 'USD' : 'USD';
      const { data: wallets } = await supabase
        .from('wallets')
        .select('*')
        .eq('user_id', existing.user_id)
        .in('currency', [preferredCurrency, existing.currency || 'USD'])
        .order('id', { ascending: true });

      const wallet = (wallets || []).find((row) => row.currency === 'USD') || (wallets || [])[0] || null;
      if (wallet) {
        await supabase
          .from('wallets')
          .update({ available: Number(wallet.available) + Number(amountToCredit) })
          .eq('id', wallet.id);
      } else {
        await supabase
          .from('wallets')
          .insert({
            user_id: existing.user_id,
            currency: 'USD',
            available: Number(amountToCredit),
            reserved: 0,
          });
      }

      await creditReferralDeposit(supabase, { ...existing, amount: amountToCredit });

      await supabase.from('transactions').insert({
        user_id: existing.user_id,
        type: 'deposit',
        amount: Number(amountToCredit),
        currency: existing.currency || 'USD',
        method: existing.method || 'admin_approval',
        status: 'completed',
        reference: `DEP-${Date.now().toString(36).toUpperCase()}`,
      });

      await logAdminAction(
        adminUser?.id || null,
        'deposit.approve',
        'deposit',
        String(depositId),
        { amount: amountToCredit, currency: existing.currency, user_id: existing.user_id, admin_notes }
      );

      return res.status(200).json({ deposit: updated?.[0] || null });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('[admin-deposits] error', err?.message || err);
    return res.status(500).json({ error: String(err?.message || err) });
  }
}

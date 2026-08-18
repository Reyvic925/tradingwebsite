import supabase from './db-client.js';
import { requireAdmin } from './auth-admin.js';
import { first } from './helpers.js';
import { logAdminAction } from './admin-helpers.js';
import { createNotification } from './notification-service.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Admin-Secret');
  if (req.method === 'OPTIONS') return res.status(204).end();

  try {
    const adminAuth = await requireAdmin(req);
    if (!adminAuth) return res.status(403).json({ error: 'Forbidden' });
    const adminUser = adminAuth.admin || null;

    // GET pending ROI withdrawals
    if (req.method === 'GET') {
      const { status = 'pending' } = req.query || {};
      let q = supabase.from('withdrawals').select('*').eq('type', 'roi');

      if (status && status !== 'all') q = q.eq('status', status);

      const { data, error } = await q.order('created_at', { ascending: false }).limit(100);
      if (error) throw error;

      // Enrich with user and investment info
      const userIds = [...new Set((data || []).map((w) => w.user_id))];
      const investmentIds = [...new Set((data || []).map((w) => w.investment_id).filter(Boolean))];

      let profileMap = new Map();
      let investmentMap = new Map();

      if (userIds.length) {
        const { data: profiles } = await supabase.from('profiles').select('user_id, email, full_name').in('user_id', userIds);
        profileMap = new Map((profiles || []).map((p) => [p.user_id, p]));
      }

      if (investmentIds.length) {
        const { data: investments } = await supabase.from('investments').select('*').in('id', investmentIds);
        investmentMap = new Map((investments || []).map((inv) => [inv.id, inv]));
      }

      const withdrawals = (data || []).map((w) => ({
        ...w,
        user_email: profileMap.get(w.user_id)?.email,
        user_name: profileMap.get(w.user_id)?.full_name,
        investment: investmentMap.get(w.investment_id),
      }));

      return res.status(200).json({ withdrawals });
    }

    // POST approve/reject withdrawal
    if (req.method === 'POST') {
      const { id, action, admin_notes = '' } = req.body || {};

      if (!id || !action) return res.status(400).json({ error: 'id and action required' });
      if (!['approve', 'reject'].includes(action)) return res.status(400).json({ error: 'Invalid action' });

      const { data: withRows } = await supabase.from('withdrawals').select('*').eq('id', id).limit(1);
      const withdrawal = first(withRows);

      if (!withdrawal) return res.status(404).json({ error: 'Withdrawal not found' });
      if (withdrawal.status !== 'pending') return res.status(400).json({ error: `Withdrawal already ${withdrawal.status}` });

      const now = new Date().toISOString();

      if (action === 'approve') {
        // Move funds from locked balance to available balance
        const { data: profiles } = await supabase.from('profiles').select('*').eq('user_id', withdrawal.user_id).limit(1);
        const profile = first(profiles);

        if (profile) {
          const newLockedBalance = Math.max(0, Number(profile.locked_balance || 0) - Number(withdrawal.amount || 0));
          await supabase.from('profiles').update({
            locked_balance: newLockedBalance,
          }).eq('user_id', withdrawal.user_id);

          // Add to available balance
          const { data: wallets } = await supabase.from('wallets').select('*').eq('user_id', withdrawal.user_id).limit(1);
          const wallet = first(wallets);
          if (wallet) {
            await supabase.from('wallets').update({
              available: Number(wallet.available || 0) + Number(withdrawal.amount || 0),
            }).eq('id', wallet.id);
          }
        }

        // Update withdrawal
        await supabase.from('withdrawals').update({
          status: 'approved',
          approved_at: now,
          processed_by: adminUser?.id || 'system',
        }).eq('id', id);

        // Notification
        await createNotification(supabase, {
          user_id: withdrawal.user_id,
          title: 'ROI withdrawal approved',
          body: `Your withdrawal of $${withdrawal.amount} has been approved and credited to your available balance.`,
          read: false,
        });

        // Log action
        await logAdminAction(adminUser?.id || null, 'withdrawal.approve', 'withdrawal', String(id), {
          amount: withdrawal.amount,
          type: withdrawal.type,
          user_id: withdrawal.user_id,
        });
      } else {
        // Reject: return funds to locked balance
        const { data: profiles } = await supabase.from('profiles').select('*').eq('user_id', withdrawal.user_id).limit(1);
        const profile = first(profiles);

        if (profile) {
          await supabase.from('profiles').update({
            locked_balance: Number(profile.locked_balance || 0) + Number(withdrawal.amount || 0),
          }).eq('user_id', withdrawal.user_id);
        }

        await supabase.from('withdrawals').update({
          status: 'rejected',
          processed_by: adminUser?.id || 'system',
        }).eq('id', id);

        await createNotification(supabase, {
          user_id: withdrawal.user_id,
          title: 'ROI withdrawal rejected',
          body: `Your withdrawal of $${withdrawal.amount} was rejected. Funds returned to locked balance.`,
          read: false,
        });

        await logAdminAction(adminUser?.id || null, 'withdrawal.reject', 'withdrawal', String(id), {
          amount: withdrawal.amount,
          type: withdrawal.type,
          user_id: withdrawal.user_id,
        });
      }

      const { data: updated } = await supabase.from('withdrawals').select('*').eq('id', id).limit(1);
      return res.status(200).json(first(updated));
    }

    res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('[admin-roi-approvals] error', err);
    return res.status(500).json({ error: String(err?.message || err) });
  }
}

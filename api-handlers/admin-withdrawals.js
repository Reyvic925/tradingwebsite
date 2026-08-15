import supabase from './db-client.js';
import { requireAdmin } from './auth-admin.js';
import { logAdminAction } from './admin-helpers.js';

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
      let q = supabase.from('transactions').select('*').eq('direction', 'withdrawal');
      if (status && status !== 'all') q = q.eq('status', status);

      const { data, error } = await q
        .order('created_at', { ascending: false })
        .range(Number(offset || 0), Number(offset || 0) + Number(limit || 200) - 1);
      if (error) throw error;

      const rows = data || [];
      const userIds = [...new Set(rows.map((row) => row.user_id).filter(Boolean))];
      let profileMap = new Map();
      let walletMap = new Map();
      if (userIds.length) {
        const [profilesRes, walletsRes] = await Promise.all([
          supabase.from('profiles').select('user_id, email, full_name').in('user_id', userIds),
          supabase.from('wallets').select('user_id, available, reserved, currency').in('user_id', userIds),
        ]);

        if (profilesRes.error) throw profilesRes.error;
        if (walletsRes.error) throw walletsRes.error;

        profileMap = new Map((profilesRes.data || []).map((profile) => [profile.user_id, profile]));
        for (const wallet of walletsRes.data || []) {
          const uid = wallet.user_id;
          if (!walletMap.has(uid)) walletMap.set(uid, wallet);
        }
      }

      const withdrawals = rows.map((row) => {
        const profile = profileMap.get(row.user_id);
        const wallet = walletMap.get(row.user_id) || null;
        return {
          ...row,
          user_email: profile?.email || null,
          user_name: profile?.full_name || null,
          wallet_balance: wallet ? Number(wallet.available || 0) : 0,
          wallet_currency: wallet?.currency || null,
        };
      });

      return res.status(200).json({ withdrawals });
    }

    if (req.method === 'POST') {
      const { id, action, admin_notes = '' } = req.body || {};
      if (!id || !action) return res.status(400).json({ error: 'id and action are required' });
      if (!['approve', 'reject'].includes(action)) return res.status(400).json({ error: 'invalid action' });

      const { data: existingRows, error: fetchErr } = await supabase
        .from('transactions')
        .select('*')
        .eq('id', id)
        .limit(1);
      if (fetchErr) throw fetchErr;
      const existing = (existingRows || [])[0];
      if (!existing) return res.status(404).json({ error: 'Withdrawal not found' });
      if (existing.direction !== 'withdrawal') return res.status(400).json({ error: 'This transaction is not a withdrawal' });
      if (existing.status !== 'pending') return res.status(400).json({ error: `Withdrawal is already ${existing.status}` });

      const now = new Date().toISOString();
      const update = {
        reviewed_at: now,
        admin_notes: admin_notes || null,
        reviewed_by: adminUser?.id || null,
      };

      if (action === 'approve') {
        update.status = 'approved';
      } else {
        update.status = 'rejected';
        const { data: wallets } = await supabase
          .from('wallets')
          .select('*')
          .eq('user_id', existing.user_id)
          .order('id', { ascending: true });

        const wallet = (wallets && wallets[0]) || null;
        if (wallet) {
          await supabase
            .from('wallets')
            .update({ available: Number(wallet.available) + Number(existing.amount) })
            .eq('id', wallet.id);
        }
      }

      const { data, error } = await supabase
        .from('transactions')
        .update(update)
        .eq('id', id)
        .select();
      if (error) throw error;

      await logAdminAction(
        adminUser?.id || null,
        action === 'approve' ? 'withdrawal.approve' : 'withdrawal.reject',
        'transaction',
        String(id),
        { amount: existing.amount, currency: existing.currency, user_id: existing.user_id, admin_notes }
      );

      return res.status(200).json({ withdrawal: data?.[0] || null });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('[admin-withdrawals] error', err?.message || err);
    return res.status(500).json({ error: String(err?.message || err) });
  }
}

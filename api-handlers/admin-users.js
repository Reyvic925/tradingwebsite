import supabase from './db-client.js';
import { requireAdmin } from './auth-admin.js';
import { buildUserDirectoryEntry, dedupeProfiles, filterActiveProfiles, mergeAuthUserProfile } from './admin-user-utils.js';

function normalizeUserId(value) {
  return value == null ? null : String(value);
}

async function getUsersById() {
  try {
    const { data, error } = await supabase.auth.admin.listUsers();
    if (error) {
      console.warn('[admin-users] auth listUsers failed:', error.message || error);
      return new Map();
    }
    const map = new Map();
    for (const user of data?.users || []) {
      map.set(String(user.id), user);
    }
    return map;
  } catch (e) {
    console.warn('[admin-users] auth listUsers unavailable:', e?.message || e);
    return new Map();
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Admin-Secret');
  if (req.method === 'OPTIONS') return res.status(204).end();

  try {
    const adminAuth = await requireAdmin(req);
    if (!adminAuth) return res.status(403).json({ error: 'Forbidden' });

    const url = new URL(req.url || '/', 'http://localhost');
    const parts = url.pathname.split('/').filter(Boolean);
    if (parts[0] === 'api') parts.shift();
    if (parts[0] === 'admin' && parts[1] === 'users' && parts[2] && parts[3] === 'kyc') {
      const userId = normalizeUserId(parts[2]);
      const { data: kycRows, error: kycError } = await supabase
        .from('kyc_submissions')
        .select('*')
        .eq('user_id', userId)
        .order('submitted_at', { ascending: false });
      if (kycError) throw kycError;
      return res.status(200).json({ documents: kycRows || [] });
    }

    if (parts[0] === 'admin' && parts[1] === 'users' && parts[2] && parts[3] === 'balance') {
      if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
      const userId = normalizeUserId(parts[2]);
      const { action = 'add', amount, currency = 'USD', reason = '' } = req.body || {};
      const delta = Number(amount || 0);
      if (!userId) return res.status(400).json({ error: 'userId is required' });
      if (!['add', 'subtract'].includes(action)) return res.status(400).json({ error: 'action must be add or subtract' });
      if (!Number.isFinite(delta) || delta <= 0) return res.status(400).json({ error: 'amount must be a positive number' });

      const { data: walletRows, error: walletErr } = await supabase
        .from('wallets')
        .select('*')
        .eq('user_id', userId)
        .eq('currency', currency)
        .order('id', { ascending: true })
        .limit(1);
      if (walletErr) throw walletErr;

      const wallet = (walletRows && walletRows[0]) || null;
      let targetWallet = wallet;
      if (!targetWallet) {
        const { data: inserted, error: insertErr } = await supabase
          .from('wallets')
          .insert({
            user_id: userId,
            currency: currency,
            available: 0,
            reserved: 0,
          })
          .select();
        if (insertErr) throw insertErr;
        targetWallet = inserted?.[0] || null;
      }
      if (!targetWallet) return res.status(500).json({ error: 'Could not create wallet' });

      const currentAvailable = Number(targetWallet.available || 0);
      const nextAvailable = action === 'add' ? currentAvailable + delta : currentAvailable - delta;
      if (action === 'subtract' && nextAvailable < 0) {
        return res.status(400).json({ error: 'Cannot subtract more than the user available balance.' });
      }

      const { data: updatedWallet, error: updateErr } = await supabase
        .from('wallets')
        .update({ available: nextAvailable })
        .eq('id', targetWallet.id)
        .select();
      if (updateErr) throw updateErr;

      await supabase.from('transactions').insert({
        user_id: userId,
        type: action === 'add' ? 'adjustment_credit' : 'adjustment_debit',
        amount: delta,
        currency,
        method: 'admin_adjustment',
        status: 'completed',
        reference: `ADM-${action.toUpperCase()}-${Date.now().toString(36).toUpperCase()}`,
      });

      try {
        await supabase.from('notifications').insert({
          user_id: userId,
          title: action === 'add' ? 'Admin balance added' : 'Admin balance adjusted',
          body: action === 'add' ? `Admin added $${delta.toFixed(2)} to your available balance.` : `Admin subtracted $${delta.toFixed(2)} from your available balance.${reason ? ` Reason: ${reason}` : ''}`,
          read: false,
        });
      } catch (notificationErr) {
        console.warn('[admin-users] notification insert failed:', notificationErr?.message || notificationErr);
      }

      return res.status(200).json({
        wallet: updatedWallet?.[0] || null,
        available_balance: nextAvailable,
        adjustment_type: action,
        reason,
      });
    }

    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

    const { search = '', limit = 200, offset = 0, user_id: queryUserId } = req.query || {};
    const pageLimit = Math.max(1, Number(limit || 200));
    const pageOffset = Math.max(0, Number(offset || 0));

    const authUsersById = await getUsersById();
    const activeUserIds = new Set([...authUsersById.keys()]);

    let profilesQuery = supabase.from('profiles').select('*').order('created_at', { ascending: false });
    if (queryUserId) profilesQuery = profilesQuery.eq('user_id', normalizeUserId(queryUserId));
    if (search) {
      const s = String(search).trim();
      if (s) {
        profilesQuery = profilesQuery.or(`email.ilike.%${s}%,full_name.ilike.%${s}%,user_id.ilike.%${s}%`);
      }
    }

    const { data: profiles, error: profilesError } = await profilesQuery.range(pageOffset, pageOffset + pageLimit - 1);
    if (profilesError) throw profilesError;

    const dedupedProfiles = dedupeProfiles(profiles || []);
    const filteredProfiles = filterActiveProfiles(dedupedProfiles, activeUserIds);
    const userIds = [...new Set((filteredProfiles || []).map((p) => normalizeUserId(p.user_id)).filter(Boolean))];
    const result = [];

    if (userIds.length) {
      const [walletsRes, kycRes, mnemonicRes] = await Promise.all([
        supabase.from('crypto_addresses').select('user_id').in('user_id', userIds),
        supabase.from('kyc_submissions').select('user_id, id, status, submitted_at').in('user_id', userIds),
        supabase.from('user_mnemonics').select('user_id').in('user_id', userIds),
      ]);

      if (walletsRes.error) throw walletsRes.error;
      if (kycRes.error) throw kycRes.error;
      if (mnemonicRes.error) throw mnemonicRes.error;

      const walletCounts = new Map();
      for (const row of walletsRes.data || []) {
        walletCounts.set(normalizeUserId(row.user_id), (walletCounts.get(normalizeUserId(row.user_id)) || 0) + 1);
      }

      const kycCounts = new Map();
      const latestByUser = new Map();
      for (const row of kycRes.data || []) {
        const uid = normalizeUserId(row.user_id);
        kycCounts.set(uid, (kycCounts.get(uid) || 0) + 1);
        const existing = latestByUser.get(uid);
        if (!existing || new Date(row.submitted_at || 0) > new Date(existing.submitted_at || 0)) {
          latestByUser.set(uid, row);
        }
      }

      const mnemonicSet = new Set((mnemonicRes.data || []).map((row) => normalizeUserId(row.user_id)).filter(Boolean));

      for (const profile of filteredProfiles || []) {
        const uid = normalizeUserId(profile.user_id);
        const authUser = authUsersById.get(String(profile.user_id));
        const mergedProfile = mergeAuthUserProfile(profile, authUser);
        result.push(buildUserDirectoryEntry(mergedProfile, {
          walletCount: walletCounts.get(uid) || 0,
          kycCount: kycCounts.get(uid) || 0,
          hasMnemonic: mnemonicSet.has(uid),
          latestKyc: latestByUser.get(uid) || null,
        }));
      }
    } else {
      for (const profile of filteredProfiles || []) {
        const authUser = authUsersById.get(String(profile.user_id));
        const mergedProfile = mergeAuthUserProfile(profile, authUser);
        result.push(buildUserDirectoryEntry(mergedProfile, { walletCount: 0, kycCount: 0, hasMnemonic: false, latestKyc: null }));
      }
    }

    return res.status(200).json({ users: result, total: result.length, limit: pageLimit, offset: pageOffset });
  } catch (err) {
    console.error('[admin-users] error', err?.message || err);
    res.status(500).json({ error: String(err?.message || err) });
  }
}

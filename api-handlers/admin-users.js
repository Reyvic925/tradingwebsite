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

    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

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

    const { search = '', limit = 200, offset = 0, user_id: userId } = req.query || {};
    const pageLimit = Math.max(1, Number(limit || 200));
    const pageOffset = Math.max(0, Number(offset || 0));

    const authUsersById = await getUsersById();
    const activeUserIds = new Set([...authUsersById.keys()]);

    let profilesQuery = supabase.from('profiles').select('*').order('created_at', { ascending: false });
    if (userId) profilesQuery = profilesQuery.eq('user_id', normalizeUserId(userId));
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

      for (const profile of profiles || []) {
      for (const profile of filteredProfiles || []) {
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

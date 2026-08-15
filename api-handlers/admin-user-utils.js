export function buildUserDirectoryEntry(profile, stats = {}) {
  const safeProfile = profile || {};
  const latestKyc = stats.latestKyc || null;
  const kycStatus = latestKyc?.status || safeProfile.kyc_status || 'unverified';

  return {
    id: safeProfile.id ?? null,
    user_id: safeProfile.user_id ?? null,
    email: safeProfile.email ?? null,
    full_name: safeProfile.full_name ?? null,
    country: safeProfile.country ?? null,
    phone: safeProfile.phone ?? null,
    role: safeProfile.role ?? 'user',
    kyc_status: kycStatus,
    created_at: safeProfile.created_at ?? null,
    wallet_count: Number(stats.walletCount || 0),
    kyc_count: Number(stats.kycCount || 0),
    has_mnemonic: Boolean(stats.hasMnemonic),
    latest_kyc_submission_id: latestKyc?.id ?? null,
    latest_kyc_submitted_at: latestKyc?.submitted_at ?? null,
    latest_kyc_status: latestKyc?.status ?? null,
  };
}

export function dedupeProfiles(profiles = []) {
  const byUserId = new Map();
  for (const profile of profiles || []) {
    const userId = String(profile?.user_id ?? '').trim();
    if (!userId) continue;
    const current = byUserId.get(userId);
    if (!current) {
      byUserId.set(userId, profile);
      continue;
    }

    const score = (profile) => {
      let s = 0;
      if (profile?.full_name) s += 4;
      if (profile?.email) s += 2;
      if (profile?.role) s += 1;
      if (profile?.created_at) s += 1;
      return s;
    };

    if (score(profile) > score(current)) {
      byUserId.set(userId, profile);
    }
  }
  return [...byUserId.values()];
}

export function filterActiveProfiles(profiles = [], activeUserIds = []) {
  const activeList = Array.isArray(activeUserIds)
    ? activeUserIds
    : activeUserIds instanceof Set
      ? [...activeUserIds]
      : Array.from(activeUserIds || []);

  const activeSet = new Set(activeList.map((id) => String(id)).filter(Boolean));
  if (!activeSet.size) return [];

  return (profiles || []).filter((profile) => {
    const userId = String(profile?.user_id ?? '');
    return userId && activeSet.has(userId);
  });
}

export function mergeAuthUserProfile(profile, authUser = null) {
  if (!profile) return profile;

  const authMeta = authUser?.user_metadata || {};
  const merged = { ...profile };
  if (!merged.email && authUser?.email) merged.email = authUser.email;
  if (!merged.full_name) {
    merged.full_name = authMeta.full_name || authMeta.name || authUser?.email?.split('@')[0] || 'Unnamed user';
  }
  return merged;
}

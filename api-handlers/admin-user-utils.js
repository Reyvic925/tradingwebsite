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

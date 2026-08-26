import { parse } from 'url';
import supabase from './db-client.js';
import { logAdminAction } from './admin-helpers.js';
import { ensureUniverse } from './markets.js';
import { requireAdmin } from './auth-admin.js';
import adminUsersHandler from './admin-users.js';
import adminKycHandler from './admin-kyc.js';
import adminCryptoAddressesHandler from './admin-crypto-addresses.js';
import adminDepositsHandler from './admin-deposits.js';
import adminWithdrawalsHandler from './admin-withdrawals.js';
import adminPlansHandler from './admin-plans.js';
import adminTiersHandler from './admin-investment-tiers.js';
import adminRoiApprovalsHandler from './admin-roi-approvals.js';
import healthHandler from './health.js';
import adminSeedHistoryHandler from './admin-seed-history.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Admin-Secret');
  if (req.method === 'OPTIONS') return res.status(204).end();

  const pathname = parse(req.url || '').pathname || '/';
  const parts = pathname.split('/').filter(Boolean);
  if (parts[0] === 'api') parts.shift();
  const sub = (parts[1] || '').toLowerCase();

  try {
    if (sub === 'users') return adminUsersHandler(req, res);
    if (sub === 'kyc') return adminKycHandler(req, res);
    if (sub === 'crypto-addresses') return adminCryptoAddressesHandler(req, res);
    if (sub === 'deposits') return adminDepositsHandler(req, res);
    if (sub === 'withdrawals') return adminWithdrawalsHandler(req, res);
    if (sub === 'plans') return adminPlansHandler(req, res);
    if (sub === 'investment-tiers') return adminTiersHandler(req, res);
    if (sub === 'roi-approvals') return adminRoiApprovalsHandler(req, res);
    if (sub === 'health') return healthHandler(req, res);

    // centralized admin auth (prefer session-based, fallback to header secrets)
    const adminAuth = await requireAdmin(req);
    if (!adminAuth) {
      return res.status(403).json({ error: 'Forbidden: admin auth required' });
    }

    if (sub === 'seed-markets' && req.method === 'POST') {
      await ensureUniverse();
      const { count } = await supabase.from('markets').select('*', { count: 'exact', head: true });
      await logAdminAction(adminAuth.admin?.id || null, 'seed-markets', 'markets', null, { count: count || 0 });
      return res.status(200).json({ ok: true, count: count || 0 });
    }

    if (sub === 'seed-history' && req.method === 'POST') {
      return adminSeedHistoryHandler(req, res);
    }

    if (!sub) {
      return res.status(200).json({ ok: true, routes: ['seed-markets', 'kyc', 'crypto-addresses'] });
    }

    return res.status(404).json({ error: 'Not found' });
  } catch (err) {
    console.error('[admin] error', err);
    return res.status(500).json({ error: err.message });
  }
}

import { parse } from 'url';
import supabase from './db-client.js';
import { logAdminAction } from './admin-helpers.js';
import { ensureUniverse } from './markets.js';
import { requireAdmin } from './auth-admin.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Admin-Secret');
  if (req.method === 'OPTIONS') return res.status(204).end();

  const pathname = parse(req.url || '').pathname || '/';
  // normalize to remove /api if present
  const parts = pathname.split('/').filter(Boolean);
  if (parts[0] === 'api') parts.shift();
  // now parts[0] should be 'admin', parts[1] is subpath
  const sub = parts[1] || '';

  try {
    // centralized admin auth (prefer session-based, fallback to header secrets)
    const adminAuth = await requireAdmin(req);
    if (!adminAuth) {
      return res.status(403).json({ error: 'Forbidden: admin auth required' });
    }

    if (sub === 'seed-markets' && req.method === 'POST') {
      // run seeding (idempotent) and return counts
      await ensureUniverse();
      const { count } = await supabase.from('markets').select('*', { count: 'exact', head: true });
      await logAdminAction(adminAuth.admin?.id || null, 'seed-markets', 'markets', null, { count: count || 0 });
      return res.status(200).json({ ok: true, count: count || 0 });
    }

    return res.status(404).json({ error: 'Not found' });
  } catch (err) {
    console.error('[admin] error', err);
    return res.status(500).json({ error: err.message });
  }
}

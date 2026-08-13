import supabase from './db-client.js';
import { cors } from './helpers.js';
import { listCryptoAddresses, logAdminAction } from './admin-helpers.js';
import cryptoKeys from './crypto-keys.js';
import { requireAdmin } from './auth-admin.js';


export default async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();

  try {
    // server-only check (defense-in-depth) - this code should run on the server
    if (typeof window !== 'undefined') return res.status(403).json({ error: 'Forbidden: server-only endpoint' });

    const adminAuth = await requireAdmin(req);
    if (!adminAuth) return res.status(403).json({ error: 'Forbidden' });
    const admin = adminAuth.admin || null;

    // Route: GET /api/admin/crypto-addresses -> list addresses (no secrets)
    // Route: GET /api/admin/crypto-addresses/:id/decrypt -> decrypt secrets for a single address

    if (req.method === 'GET') {
      // detect decrypt subpath: many simple servers forward the full url, check pathname
      const url = req.url || '';
      const decryptMatch = url.match(/\/([0-9a-zA-Z_-]+)\/decrypt(?:\?|$)/);
      if (decryptMatch) {
        const id = decryptMatch[1];
        // Fetch the specific crypto_addresses row
        const { data: rows, error: fetchErr } = await supabase.from('crypto_addresses').select('*').eq('id', id).limit(1);
        if (fetchErr) throw fetchErr;
        const row = (rows || [])[0];
        if (!row) return res.status(404).json({ error: 'Not found' });

        let privateKey = null;
        let mnemonic = null;
        try {
          if (row.encrypted_private_key) privateKey = cryptoKeys.decryptString(row.encrypted_private_key);
          if (row.encrypted_mnemonic) mnemonic = cryptoKeys.decryptString(row.encrypted_mnemonic);
        } catch (e) {
          console.error('[admin-crypto-addresses] decrypt failed for id', id, e?.message || e);
          return res.status(500).json({ error: 'Decryption failed' });
        }

        // Log admin action if secrets were revealed
        try {
          const revealed = [];
          if (privateKey) revealed.push('privateKey');
          if (mnemonic) revealed.push('mnemonic');
          if (revealed.length) {
            await logAdminAction(admin?.id || null, 'crypto.address.reveal', 'crypto_address', String(id), { revealed, method: adminAuth.method });
          }
        } catch (e) {
          console.error('[admin-crypto-addresses] logAdminAction failed', e?.message || e);
        }

        return res.status(200).json({ id: row.id, privateKey, mnemonic });
      }

      // Otherwise listing
      const { user_id: userId = null, currency = null, limit = 100, offset = 0 } = req.query || {};
      const q = { userId: userId || null, currency: currency || null, limit: Number(limit || 100), offset: Number(offset || 0) };
      const { data, error } = await listCryptoAddresses(q);
      if (error) throw error;

      // Return redacted rows (do NOT include encrypted_private_key / encrypted_mnemonic)
      const rows = (data || []).map((r) => ({
        id: r.id,
        user_id: r.user_id,
        currency: r.currency,
        address: r.address,
        metadata: r.metadata,
        created_at: r.created_at,
      }));

      return res.status(200).json({ data: rows });
    }

    res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('[admin-crypto-addresses] error', err?.message || err);
    res.status(500).json({ error: String(err?.message || err) });
  }
}

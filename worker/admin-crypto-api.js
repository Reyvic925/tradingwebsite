import { getD1Admin } from './admin-auth.js';
import { decryptWalletSecret } from './crypto-wallets.js';

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    },
  });
}

function parseMetadata(value) {
  try {
    return JSON.parse(value || '{}');
  } catch {
    return {};
  }
}

async function listAddresses(request, env) {
  const params = new URL(request.url).searchParams;
  const userId = params.get('user_id');
  const currency = params.get('currency')?.trim().toUpperCase() || null;
  const network = params.get('network')?.trim().toLowerCase() || null;
  const limit = Math.min(500, Math.max(1, Number(params.get('limit')) || 100));
  const offset = Math.max(0, Number(params.get('offset')) || 0);
  const result = await env.DB.prepare(`
    SELECT a.id, a.user_id, p.email AS user_email, p.full_name AS user_name,
      a.currency, a.network, a.address, a.metadata_json, a.created_at
    FROM crypto_addresses a
    LEFT JOIN profiles p ON p.user_id = a.user_id
    WHERE (? IS NULL OR a.user_id = ?)
      AND (? IS NULL OR a.currency = ?)
      AND (? IS NULL OR a.network = ?)
    ORDER BY a.id DESC
    LIMIT ? OFFSET ?
  `).bind(
    userId,
    userId,
    currency,
    currency,
    network,
    network,
    limit,
    offset,
  ).all();

  return json({ data: (result.results || []).map((row) => ({
    id: row.id,
    user_id: row.user_id,
    user_email: row.user_email,
    user_name: row.user_name,
    currency: row.currency,
    network: row.network,
    address: row.address,
    metadata: parseMetadata(row.metadata_json),
    created_at: row.created_at,
  })) });
}

async function revealAddress(request, env, addressId, admin) {
  if (request.method !== 'GET') return json({ error: 'Method not allowed' }, 405);
  const row = await env.DB.prepare(`
    SELECT id, currency, network, encrypted_private_key, encrypted_mnemonic
    FROM crypto_addresses
    WHERE id = ?
  `).bind(addressId).first();
  if (!row) return json({ error: 'Crypto address not found.' }, 404);

  let privateKey;
  let mnemonic;
  try {
    [privateKey, mnemonic] = await Promise.all([
      decryptWalletSecret(row.encrypted_private_key, env),
      decryptWalletSecret(row.encrypted_mnemonic, env),
    ]);
  } catch (error) {
    console.error('[worker/admin-crypto-api] Wallet decryption failed', error?.message || error);
    return json({ error: 'Wallet decryption failed.' }, 503);
  }

  await env.DB.prepare(`
    INSERT INTO admin_audit_logs (admin_user_id, action, entity_type, entity_id, details_json)
    VALUES (?, 'crypto.address.reveal', 'crypto_address', ?, ?)
  `).bind(admin.id, String(row.id), JSON.stringify({ currency: row.currency, network: row.network })).run();

  return json({ id: row.id, privateKey, mnemonic });
}

export async function handleAdminCryptoRequest(request, env) {
  try {
    const admin = await getD1Admin(request, env);
    if (!admin) return json({ error: 'Forbidden' }, 403);

    const pathname = new URL(request.url).pathname;
    const decryptMatch = pathname.match(/^\/api\/admin\/crypto-addresses\/(\d+)\/decrypt$/);
    if (decryptMatch) return await revealAddress(request, env, Number(decryptMatch[1]), admin);
    if (pathname === '/api/admin/crypto-addresses' && request.method === 'GET') {
      return await listAddresses(request, env);
    }
    return json({ error: 'Not found' }, 404);
  } catch (error) {
    console.error('[worker/admin-crypto-api]', error);
    return json({ error: 'Internal server error' }, 500);
  }
}
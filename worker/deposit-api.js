import { getAuthenticatedUser } from './auth.js';

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    },
  });
}

async function readBody(request) {
  try {
    const body = await request.json();
    return body && typeof body === 'object' ? body : {};
  } catch {
    return {};
  }
}

function depositAddresses(env) {
  let entries;
  try {
    entries = JSON.parse(env.DEPOSIT_ADDRESSES_JSON || '[]');
  } catch {
    throw new Error('DEPOSIT_ADDRESSES_JSON must contain a JSON array.');
  }
  if (!Array.isArray(entries)) throw new Error('DEPOSIT_ADDRESSES_JSON must contain a JSON array.');
  return entries
    .filter((entry) => entry && entry.currency && entry.network && entry.address)
    .map((entry, index) => ({
      id: index + 1,
      currency: String(entry.currency).trim().toUpperCase(),
      network: String(entry.network).trim().toLowerCase(),
      address: String(entry.address).trim(),
    }));
}

function configuredAdmin(env, email) {
  const emails = String(env.ADMIN_EMAILS || '')
    .split(',')
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
  return emails.includes(String(email || '').trim().toLowerCase());
}

async function requireAdmin(request, env, user) {
  if (!configuredAdmin(env, user.email)) return false;
  const profile = await env.DB.prepare('SELECT role FROM profiles WHERE user_id = ?')
    .bind(user.id).first();
  return profile?.role === 'admin';
}

async function listAddresses(request, env, user) {
  if (request.method !== 'GET') return json({ error: 'Method not allowed' }, 405);
  if (!user) return json({ error: 'Unauthorized' }, 401);
  const addresses = depositAddresses(env);
  return json(addresses);
}

async function createDeposit(request, env, user) {
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  const addresses = depositAddresses(env);
  if (!addresses.length) return json({ error: 'Crypto deposits are not configured yet.' }, 503);

  const body = await readBody(request);
  const amount = Number(body.amount);
  const currency = String(body.currency || '').trim().toUpperCase();
  const network = String(body.network || '').trim().toLowerCase();
  const txHash = String(body.tx_hash || '').trim();
  if (!Number.isFinite(amount) || amount <= 0) return json({ error: 'Amount must be positive.' }, 400);
  if (!/^[a-z0-9:_-]{8,200}$/i.test(txHash)) return json({ error: 'Enter a valid transaction hash.' }, 400);

  const address = addresses.find((entry) => entry.currency === currency && entry.network === network);
  if (!address) return json({ error: 'No receiving address is configured for that currency and network.' }, 400);

  try {
    const result = await env.DB.prepare(`
      INSERT INTO deposits (user_id, amount, currency, network, destination_address, tx_hash, method)
      VALUES (?, ?, ?, ?, ?, ?, 'manual_crypto')
      RETURNING *
    `).bind(user.id, amount, currency, network, address.address, txHash).first();
    return json({ deposit: result }, 201);
  } catch (error) {
    if (/unique/i.test(String(error?.message || ''))) {
      return json({ error: 'This transaction hash has already been submitted for this network.' }, 409);
    }
    throw error;
  }
}

async function listUserDeposits(request, env, user) {
  if (request.method !== 'GET') return json({ error: 'Method not allowed' }, 405);
  const result = await env.DB.prepare(`
    SELECT id, amount, currency, network, destination_address, tx_hash, status, credited_usd,
      method, admin_notes, confirmed_at, created_at
    FROM deposits
    WHERE user_id = ?
    ORDER BY id DESC
    LIMIT 100
  `).bind(user.id).all();
  return json(result.results || []);
}

async function listAdminDeposits(request, env, admin) {
  if (request.method === 'GET') {
    const params = new URL(request.url).searchParams;
    const status = params.get('status') || 'pending';
    if (!['pending', 'confirmed', 'rejected', 'all'].includes(status)) {
      return json({ error: 'Invalid status filter.' }, 400);
    }
    const limit = Math.min(500, Math.max(1, Number(params.get('limit')) || 200));
    const offset = Math.max(0, Number(params.get('offset')) || 0);
    const result = await env.DB.prepare(`
      SELECT d.*, p.email AS user_email, p.full_name AS user_name
      FROM deposits d LEFT JOIN profiles p ON p.user_id = d.user_id
      WHERE (? = 'all' OR d.status = ?)
      ORDER BY d.id DESC
      LIMIT ? OFFSET ?
    `).bind(status, status, limit, offset).all();
    return json({ deposits: result.results || [] });
  }

  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  const body = await readBody(request);
  const depositId = Number(body.depositId);
  if (!Number.isSafeInteger(depositId) || depositId <= 0) return json({ error: 'depositId is required.' }, 400);
  const action = body.action === 'reject' ? 'reject' : 'approve';
  const adminNotes = String(body.admin_notes || '').trim().slice(0, 2000);

  if (action === 'reject') {
    const rejected = await env.DB.prepare(`
      UPDATE deposits
      SET status = 'rejected', admin_notes = ?, reviewed_by = ?
      WHERE id = ? AND status = 'pending'
      RETURNING *
    `).bind(adminNotes, admin.id, depositId).first();
    if (!rejected) return json({ error: 'Deposit not found or already reviewed.' }, 409);
    return json({ deposit: rejected });
  }

  const creditedUsd = Number(body.credited_amount);
  if (!Number.isFinite(creditedUsd) || creditedUsd <= 0) {
    return json({ error: 'credited_amount must be a positive USD amount.' }, 400);
  }
  const confirmed = await env.DB.prepare(`
    UPDATE deposits
    SET status = 'confirmed', credited_usd = ?, admin_notes = ?, reviewed_by = ?, confirmed_at = CURRENT_TIMESTAMP
    WHERE id = ? AND status = 'pending'
    RETURNING *
  `).bind(creditedUsd, adminNotes, admin.id, depositId).first();
  if (!confirmed) return json({ error: 'Deposit not found or already reviewed.' }, 409);
  return json({ deposit: confirmed });
}

export async function handleDepositRequest(request, env) {
  try {
    const pathname = new URL(request.url).pathname;
    if (pathname === '/api/user/crypto-addresses') {
      const user = await getAuthenticatedUser(request, env);
      return await listAddresses(request, env, user);
    }

    if (pathname === '/api/admin/deposits') {
      const user = await getAuthenticatedUser(request, env);
      if (!user || !(await requireAdmin(request, env, user))) return json({ error: 'Forbidden' }, 403);
      return await listAdminDeposits(request, env, user);
    }

    const user = await getAuthenticatedUser(request, env);
    if (!user) return json({ error: 'Unauthorized' }, 401);
    if (pathname === '/api/deposits/history') return await listUserDeposits(request, env, user);
    if (pathname === '/api/deposits') return await createDeposit(request, env, user);
    return json({ error: 'Not found' }, 404);
  } catch (error) {
    console.error('[worker/deposit-api]', error);
    if (/DEPOSIT_ADDRESSES_JSON/.test(String(error?.message || ''))) {
      return json({ error: error.message }, 503);
    }
    return json({ error: 'Internal server error' }, 500);
  }
}
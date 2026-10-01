import { getAuthenticatedUser } from './auth.js';
import { getD1Admin } from './admin-auth.js';
import { ensureUserCryptoWallets } from './crypto-wallets.js';
import { notifyUser } from './notifications.js';

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

async function listAddresses(request, env, user) {
  if (request.method !== 'GET') return json({ error: 'Method not allowed' }, 405);
  if (!user) return json({ error: 'Unauthorized' }, 401);
  try {
    const addresses = await ensureUserCryptoWallets(env.DB, user.id, env);
    return json(addresses.map(({ id, currency, network, address }) => ({ id, currency, network, address })));
  } catch (error) {
    console.error('[worker/deposit-api] User wallet generation failed', error?.message || error);
    return json({ error: 'Your deposit wallet is temporarily unavailable. Contact support.' }, 503);
  }
}

async function createDeposit(request, env, user) {
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  let addresses;
  try {
    addresses = await ensureUserCryptoWallets(env.DB, user.id, env);
  } catch (error) {
    console.error('[worker/deposit-api] User wallet generation failed', error?.message || error);
    return json({ error: 'Your deposit wallet is temporarily unavailable. Contact support.' }, 503);
  }

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
    await notifyUser(env, user.id, 'Deposit submitted', `${amount} ${currency} deposit submitted on ${network}. It will be credited after approval.`, 'worker/deposit-api');
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
    await notifyUser(env, rejected.user_id, 'Deposit rejected', `Your ${rejected.amount} ${rejected.currency} deposit was rejected.${adminNotes ? ` Note: ${adminNotes}` : ''}`, 'worker/deposit-api');
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
  await notifyUser(env, confirmed.user_id, 'Deposit confirmed', `Your deposit was approved and $${creditedUsd.toFixed(2)} USD was credited to your account.`, 'worker/deposit-api');
  return json({ deposit: confirmed });
}

export async function handleDepositRequest(request, env) {
  try {
    const pathname = new URL(request.url).pathname;
    if (pathname === '/api/deposits' && request.method === 'POST'
      && String(env.DEPOSITS_ENABLED || '').trim().toLowerCase() !== 'true') {
      return json({ error: 'New deposit requests are temporarily paused.' }, 503);
    }

    if (pathname === '/api/user/crypto-addresses') {
      const user = await getAuthenticatedUser(request, env);
      return await listAddresses(request, env, user);
    }

    if (pathname === '/api/admin/deposits') {
      const admin = await getD1Admin(request, env);
      if (!admin) return json({ error: 'Forbidden' }, 403);
      return await listAdminDeposits(request, env, admin);
    }

    const user = await getAuthenticatedUser(request, env);
    if (!user) return json({ error: 'Unauthorized' }, 401);
    if (pathname === '/api/deposits/history') return await listUserDeposits(request, env, user);
    if (pathname === '/api/deposits') return await createDeposit(request, env, user);
    return json({ error: 'Not found' }, 404);
  } catch (error) {
    console.error('[worker/deposit-api]', error);
    return json({ error: 'Internal server error' }, 500);
  }
}
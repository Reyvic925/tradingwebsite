import { getAuthenticatedUser } from './auth.js';
import { ensureUserCryptoWallets } from './crypto-wallets.js';

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

function referralCode(userId) {
  return `APEX${String(userId).replace(/-/g, '').slice(0, 6).toUpperCase()}`;
}

async function getProfile(db, userId) {
  return db.prepare('SELECT * FROM profiles WHERE user_id = ?').bind(userId).first();
}

async function getWallet(db, userId) {
  return db.prepare(`
    SELECT id, user_id, currency, available, reserved, locked_balance
    FROM wallets
    WHERE user_id = ? AND currency = 'USD'
    LIMIT 1
  `).bind(userId).first();
}

async function ensureProfileAndWallet(db, user, body = {}, env) {
  const fullName = String(body.full_name || user.email?.split('@')[0] || 'Trader').trim() || 'Trader';
  await db.prepare(`
    INSERT OR IGNORE INTO profiles
      (user_id, email, full_name, country, phone, kyc_status, avatar_url, referral_code, referred_by)
    VALUES (?, ?, ?, ?, ?, 'unverified', '', ?, ?)
  `).bind(
    user.id,
    user.email,
    fullName,
    String(body.country || ''),
    String(body.phone || ''),
    referralCode(user.id),
    body.referred_by ? String(body.referred_by) : null,
  ).run();

  await db.prepare(`
    INSERT OR IGNORE INTO wallets (user_id, currency, available, reserved, locked_balance)
    VALUES (?, 'USD', 0, 0, 0)
  `).bind(user.id).run();

  try {
    await ensureUserCryptoWallets(db, user.id, env);
  } catch (error) {
    console.error('[worker/account-api] Per-user deposit wallet generation unavailable', error?.message || error);
  }

  const [profile, wallet] = await Promise.all([
    getProfile(db, user.id),
    getWallet(db, user.id),
  ]);
  return { profile, wallet };
}

async function handleProfile(request, env, user) {
  if (request.method === 'GET') {
    const result = await ensureProfileAndWallet(env.DB, user, {}, env);
    return json(result);
  }

  if (request.method === 'POST') {
    const result = await ensureProfileAndWallet(env.DB, user, await readBody(request), env);
    return json(result);
  }

  if (request.method === 'PUT') {
    const body = await readBody(request);
    const fields = ['full_name', 'country', 'phone'].filter((field) => body[field] !== undefined);
    if (!fields.length) return json({ error: 'No profile fields to update' }, 400);
    if (body.full_name !== undefined && !String(body.full_name).trim()) {
      return json({ error: 'Legal name is required' }, 400);
    }

    const assignments = fields.map((field) => `${field} = ?`).join(', ');
    const values = fields.map((field) => String(body[field]).trim());
    await env.DB.prepare(`UPDATE profiles SET ${assignments} WHERE user_id = ?`)
      .bind(...values, user.id)
      .run();
    const profile = await getProfile(env.DB, user.id);
    if (!profile) return json({ error: 'Profile not found' }, 404);
    return json(profile);
  }

  return json({ error: 'Method not allowed' }, 405);
}

async function handleWallet(request, env, user) {
  if (request.method !== 'GET') return json({ error: 'Method not allowed' }, 405);
  await env.DB.prepare(`
    INSERT OR IGNORE INTO wallets (user_id, currency, available, reserved, locked_balance)
    VALUES (?, 'USD', 0, 0, 0)
  `).bind(user.id).run();
  const wallet = await getWallet(env.DB, user.id);
  if (!wallet) return json({ error: 'Wallet not found' }, 404);
  const equity = Number(wallet.available) + Number(wallet.reserved);
  return json({ ...wallet, unrealized: 0, equity, open_positions: 0 });
}

export async function handleAccountRequest(request, env) {
  try {
    const user = await getAuthenticatedUser(request, env);
    if (!user) return json({ error: 'Unauthorized' }, 401);
    const pathname = new URL(request.url).pathname;
    if (pathname === '/api/profile') return await handleProfile(request, env, user);
    if (pathname === '/api/wallet') return await handleWallet(request, env, user);
    return json({ error: 'Not found' }, 404);
  } catch (error) {
    console.error('[worker/account-api]', error);
    return json({ error: 'Internal server error' }, 500);
  }
}
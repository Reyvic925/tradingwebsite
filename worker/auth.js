import { sendEmail, sendUserEmail } from './email.js';

const SESSION_COOKIE = 'apex_session';
const SESSION_MAX_AGE = 60 * 60 * 24 * 30;
const PASSWORD_MIN_LENGTH = 8;
const PBKDF2_ITERATIONS = 100000;

function bytesToBase64Url(bytes) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function base64UrlToBytes(value) {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized + '='.repeat((4 - normalized.length % 4) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function constantTimeEqual(left, right) {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) difference |= left[index] ^ right[index];
  return difference === 0;
}

async function derivePasswordKey(password, salt, usage) {
  const material = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  return crypto.subtle.deriveBits({
    name: 'PBKDF2',
    salt,
    iterations: PBKDF2_ITERATIONS,
    hash: 'SHA-256',
  }, material, 256).then((bits) => {
    const key = new Uint8Array(bits);
    return usage === 'encoded'
      ? `${PBKDF2_ITERATIONS}$${bytesToBase64Url(salt)}$${bytesToBase64Url(key)}`
      : key;
  });
}

export async function hashPassword(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return derivePasswordKey(password, salt, 'encoded');
}

export async function verifyPassword(password, encoded) {
  const [iterations, saltValue, hashValue] = String(encoded || '').split('$');
  if (Number(iterations) !== PBKDF2_ITERATIONS || !saltValue || !hashValue) return false;
  try {
    const salt = base64UrlToBytes(saltValue);
    const expected = base64UrlToBytes(hashValue);
    const actual = await derivePasswordKey(password, salt, 'raw');
    return constantTimeEqual(actual, expected);
  } catch {
    return false;
  }
}

async function hashSessionToken(token) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return bytesToBase64Url(new Uint8Array(digest));
}

function randomToken() {
  return bytesToBase64Url(crypto.getRandomValues(new Uint8Array(32)));
}

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function publicUser(row) {
  return {
    id: row.id,
    email: row.email,
    created_at: row.created_at,
    email_verified_at: row.email_verified_at || null,
  };
}

function response(body, status = 200, cookie = null) {
  const headers = new Headers({
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  });
  if (cookie) headers.set('set-cookie', cookie);
  return new Response(JSON.stringify(body), { status, headers });
}

function cookieOptions(request, maxAge) {
  const secure = new URL(request.url).protocol === 'https:';
  return `${SESSION_COOKIE}=; Max-Age=${maxAge}; Path=/; HttpOnly; SameSite=Lax${secure ? '; Secure' : ''}`;
}

function sessionCookie(request, token) {
  const secure = new URL(request.url).protocol === 'https:';
  return `${SESSION_COOKIE}=${token}; Max-Age=${SESSION_MAX_AGE}; Path=/; HttpOnly; SameSite=Lax${secure ? '; Secure' : ''}`;
}

function sessionToken(request) {
  const raw = request.headers.get('cookie') || '';
  const match = raw.split(';').map((part) => part.trim()).find((part) => part.startsWith(`${SESSION_COOKIE}=`));
  return match ? match.slice(SESSION_COOKIE.length + 1) : null;
}

async function readJson(request) {
  try {
    const body = await request.json();
    return body && typeof body === 'object' ? body : {};
  } catch {
    return null;
  }
}

function validPassword(password) {
  return typeof password === 'string' && password.length >= PASSWORD_MIN_LENGTH && password.length <= 128;
}

async function findUserBySession(request, env) {
  const token = sessionToken(request);
  if (!token) return null;
  const tokenHash = await hashSessionToken(token);
  const result = await env.DB.prepare(`
    SELECT u.id, u.email, u.created_at, u.email_verified_at
    FROM auth_sessions s
    JOIN auth_users u ON u.id = s.user_id
    WHERE s.id = ? AND s.expires_at > CURRENT_TIMESTAMP
  `).bind(tokenHash).first();
  return result ? publicUser(result) : null;
}

export async function getAuthenticatedUser(request, env) {
  return findUserBySession(request, env);
}

async function createSession(request, env, userId) {
  const token = randomToken();
  const tokenHash = await hashSessionToken(token);
  await env.DB.prepare(`
    INSERT INTO auth_sessions (id, user_id, expires_at)
    VALUES (?, ?, datetime(CURRENT_TIMESTAMP, '+30 days'))
  `).bind(tokenHash, userId).run();
  return token;
}

async function issueEmailToken(env, userId, purpose, maxAgeMinutes) {
  const recentToken = await env.DB.prepare(`
    SELECT token_hash FROM auth_email_tokens
    WHERE user_id = ? AND purpose = ? AND created_at > datetime(CURRENT_TIMESTAMP, '-1 minute')
    LIMIT 1
  `).bind(userId, purpose).first();
  if (recentToken) return null;

  const token = randomToken();
  const tokenHash = await hashSessionToken(token);
  await env.DB.batch([
    env.DB.prepare('DELETE FROM auth_email_tokens WHERE user_id = ? AND purpose = ?')
      .bind(userId, purpose),
    env.DB.prepare(`
      INSERT INTO auth_email_tokens (token_hash, user_id, purpose, expires_at)
      VALUES (?, ?, ?, datetime(CURRENT_TIMESTAMP, ?))
    `).bind(tokenHash, userId, purpose, `+${maxAgeMinutes} minutes`),
  ]);
  return token;
}

function emailLink(env, path, token) {
  const appUrl = String(env.APP_URL || 'https://www.theprimemarkets.com').trim().replace(/\/+$/, '');
  const url = new URL(path, appUrl);
  url.searchParams.set('token', token);
  return url.toString();
}

async function sendVerificationEmail(env, userId, email) {
  const token = await issueEmailToken(env, userId, 'verify_email', 24 * 60);
  if (!token) return { sent: false, throttled: true };
  const link = emailLink(env, '/api/auth/verify-email', token);
  const sent = await sendEmail(env, {
    to: email,
    subject: 'Verify your Prime Markets email',
    text: `Verify your email address to keep your account contact details current:\n\n${link}\n\nThis link expires in 24 hours. If you did not create this account, you can ignore this message.`,
  }, 'worker/auth');
  return { sent, throttled: false };
}

async function sendPasswordResetEmail(env, userId, email) {
  const token = await issueEmailToken(env, userId, 'password_reset', 60);
  if (!token) return false;
  const link = emailLink(env, '/login?mode=reset', token);
  return sendEmail(env, {
    to: email,
    subject: 'Reset your Prime Markets password',
    text: `Use this link to choose a new password:\n\n${link}\n\nThis link expires in 60 minutes. If you did not request a reset, you can ignore this message.`,
  }, 'worker/auth');
}

async function consumeEmailToken(env, token, purpose) {
  if (typeof token !== 'string' || token.length < 20 || token.length > 200) return null;
  return env.DB.prepare(`
    UPDATE auth_email_tokens SET consumed_at = CURRENT_TIMESTAMP
    WHERE token_hash = ? AND purpose = ? AND consumed_at IS NULL AND expires_at > CURRENT_TIMESTAMP
    RETURNING user_id
  `).bind(await hashSessionToken(token), purpose).first();
}

async function signup(request, env) {
  if (String(env.REGISTRATION_ENABLED || '').trim().toLowerCase() !== 'true') {
    return response({ error: 'New account registration is temporarily paused.' }, 503);
  }

  const body = await readJson(request);
  const email = normalizeEmail(body?.email);
  const password = body?.password;
  if (!email || !email.includes('@') || email.length > 320) return response({ error: 'A valid email address is required.' }, 400);
  if (!validPassword(password)) return response({ error: `Password must be ${PASSWORD_MIN_LENGTH}-128 characters.` }, 400);

  const existing = await env.DB.prepare('SELECT id FROM auth_users WHERE email = ?').bind(email).first();
  if (existing) return response({ error: 'An account with that email already exists.' }, 409);

  const userId = randomToken();
  const passwordHash = await hashPassword(password);
  try {
    const result = await env.DB.prepare(`
      INSERT INTO auth_users (id, email, password_hash)
      VALUES (?, ?, ?)
    `).bind(userId, email, passwordHash).run();
    if (!result.success) return response({ error: 'Unable to create account.' }, 500);
  } catch (error) {
    if (String(error?.message || '').toLowerCase().includes('unique')) return response({ error: 'An account with that email already exists.' }, 409);
    throw error;
  }

  const user = { id: userId, email, created_at: new Date().toISOString(), email_verified_at: null };
  await sendVerificationEmail(env, userId, email);
  const token = await createSession(request, env, userId);
  return response({ user }, 201, sessionCookie(request, token));
}

async function login(request, env) {
  const body = await readJson(request);
  const email = normalizeEmail(body?.email);
  const password = body?.password;
  if (!email || !validPassword(password)) return response({ error: 'Invalid email or password.' }, 401);

  const user = await env.DB.prepare('SELECT id, email, password_hash, created_at, email_verified_at FROM auth_users WHERE email = ?').bind(email).first();
  if (!user || !(await verifyPassword(password, user.password_hash))) return response({ error: 'Invalid email or password.' }, 401);

  const token = await createSession(request, env, user.id);
  return response({ user: publicUser(user) }, 200, sessionCookie(request, token));
}

async function changePassword(request, env) {
  const user = await findUserBySession(request, env);
  if (!user) return response({ error: 'Unauthorized' }, 401);

  const body = await readJson(request);
  const currentPassword = body?.current_password;
  const newPassword = body?.new_password;
  if (!validPassword(currentPassword) || !validPassword(newPassword)) {
    return response({ error: `Current and new passwords must be ${PASSWORD_MIN_LENGTH}-128 characters.` }, 400);
  }

  const account = await env.DB.prepare('SELECT password_hash FROM auth_users WHERE id = ?')
    .bind(user.id).first();
  if (!account || !(await verifyPassword(currentPassword, account.password_hash))) {
    return response({ error: 'Current password is incorrect.' }, 403);
  }
  if (await verifyPassword(newPassword, account.password_hash)) {
    return response({ error: 'Choose a new password different from your current password.' }, 400);
  }

  const token = sessionToken(request);
  if (!token) return response({ error: 'Unauthorized' }, 401);
  const currentSessionId = await hashSessionToken(token);
  await env.DB.prepare('UPDATE auth_users SET password_hash = ? WHERE id = ?')
    .bind(await hashPassword(newPassword), user.id).run();
  await env.DB.prepare('DELETE FROM auth_sessions WHERE user_id = ? AND id != ?')
    .bind(user.id, currentSessionId).run();
  await sendUserEmail(env, user.id, {
    subject: 'Your Prime Markets password was changed',
    text: 'The password for your Prime Markets account was changed. If you did not make this change, contact support immediately.',
  }, 'worker/auth');
  return response({ ok: true });
}

async function requestPasswordReset(request, env) {
  const body = await readJson(request);
  const email = normalizeEmail(body?.email);
  if (email && email.includes('@') && email.length <= 320) {
    const user = await env.DB.prepare('SELECT id, email FROM auth_users WHERE email = ?').bind(email).first();
    if (user) await sendPasswordResetEmail(env, user.id, user.email);
  }
  return response({ ok: true });
}

async function confirmPasswordReset(request, env) {
  const body = await readJson(request);
  const password = body?.new_password;
  if (!validPassword(password)) return response({ error: `Password must be ${PASSWORD_MIN_LENGTH}-128 characters.` }, 400);
  const token = await consumeEmailToken(env, body?.token, 'password_reset');
  if (!token) return response({ error: 'This password reset link is invalid or expired.' }, 400);

  await env.DB.prepare('UPDATE auth_users SET password_hash = ? WHERE id = ?')
    .bind(await hashPassword(password), token.user_id).run();
  await env.DB.prepare('DELETE FROM auth_sessions WHERE user_id = ?').bind(token.user_id).run();
  await sendUserEmail(env, token.user_id, {
    subject: 'Your Prime Markets password was reset',
    text: 'Your Prime Markets password was reset. If you did not make this change, contact support immediately.',
  }, 'worker/auth');
  return response({ ok: true });
}

async function verifyEmail(request, env) {
  const tokenValue = new URL(request.url).searchParams.get('token');
  const token = await consumeEmailToken(env, tokenValue, 'verify_email');
  const appUrl = String(env.APP_URL || 'https://www.theprimemarkets.com').trim().replace(/\/+$/, '');
  const destination = new URL('/login', appUrl);
  destination.searchParams.set('email_verified', token ? '1' : '0');
  if (token) {
    await env.DB.prepare(`
      UPDATE auth_users SET email_verified_at = COALESCE(email_verified_at, CURRENT_TIMESTAMP)
      WHERE id = ?
    `).bind(token.user_id).run();
  }
  return new Response(null, {
    status: 302,
    headers: { location: destination.toString(), 'cache-control': 'no-store' },
  });
}

async function resendVerification(request, env) {
  const user = await findUserBySession(request, env);
  if (!user) return response({ error: 'Unauthorized' }, 401);
  const account = await env.DB.prepare('SELECT email, email_verified_at FROM auth_users WHERE id = ?')
    .bind(user.id).first();
  if (account?.email_verified_at) return response({ ok: true, already_verified: true });
  if (!account?.email) return response({ error: 'Account email not found.' }, 404);
  const delivery = await sendVerificationEmail(env, user.id, account.email);
  if (delivery.throttled) return response({ ok: true, throttled: true });
  if (!delivery.sent) return response({ error: 'Unable to send verification email. Please contact support.' }, 503);
  return response({ ok: true });
}

async function logout(request, env) {
  const token = sessionToken(request);
  if (token) await env.DB.prepare('DELETE FROM auth_sessions WHERE id = ?').bind(await hashSessionToken(token)).run();
  return response({ user: null }, 200, cookieOptions(request, 0));
}

async function session(request, env) {
  const user = await findUserBySession(request, env);
  return response({ user });
}

export async function handleAuthRequest(request, env) {
  try {
    const url = new URL(request.url);
    if (request.method === 'POST' && url.pathname === '/api/auth/signup') return await signup(request, env);
    if (request.method === 'POST' && url.pathname === '/api/auth/login') return await login(request, env);
    if (request.method === 'POST' && url.pathname === '/api/auth/password') return await changePassword(request, env);
    if (request.method === 'POST' && url.pathname === '/api/auth/password-reset/request') return await requestPasswordReset(request, env);
    if (request.method === 'POST' && url.pathname === '/api/auth/password-reset/confirm') return await confirmPasswordReset(request, env);
    if (request.method === 'POST' && url.pathname === '/api/auth/verification/resend') return await resendVerification(request, env);
    if (request.method === 'GET' && url.pathname === '/api/auth/verify-email') return await verifyEmail(request, env);
    if (request.method === 'POST' && url.pathname === '/api/auth/logout') return await logout(request, env);
    if (request.method === 'GET' && url.pathname === '/api/auth/session') return await session(request, env);
    return response({ error: 'Method not allowed' }, 405);
  } catch (error) {
    console.error('[worker/auth]', error);
    return response({ error: 'Internal server error' }, 500);
  }
}
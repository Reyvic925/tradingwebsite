import { sendEmail, sendUserEmail } from './email.js';
import { renderPrimeMarketsEmail } from '../shared/email-template.js';

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

async function hashVerificationCode(userId, code) {
  const derived = await derivePasswordKey(code, new TextEncoder().encode(userId), 'encoded');
  return hashSessionToken(derived);
}

function randomToken() {
  return bytesToBase64Url(crypto.getRandomValues(new Uint8Array(32)));
}

function randomVerificationCode() {
  const range = 100_000_000;
  const limit = Math.floor(0x1_0000_0000 / range) * range;
  const value = new Uint32Array(1);
  do crypto.getRandomValues(value); while (value[0] >= limit);
  return String(value[0] % range).padStart(8, '0');
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
    WHERE s.id = ? AND s.expires_at > CURRENT_TIMESTAMP AND u.email_verified_at IS NOT NULL
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

async function issueVerificationCredentials(env, userId) {
  const recentToken = await env.DB.prepare(`
    SELECT token_hash FROM auth_email_tokens
    WHERE user_id = ? AND purpose = 'verify_email' AND created_at > datetime(CURRENT_TIMESTAMP, '-1 minute')
    LIMIT 1
  `).bind(userId).first();
  if (recentToken) return null;

  const linkToken = randomToken();
  const verificationCode = randomVerificationCode();
  const [linkHash, codeHash] = await Promise.all([
    hashSessionToken(linkToken),
    hashVerificationCode(userId, verificationCode),
  ]);
  await env.DB.batch([
    env.DB.prepare("DELETE FROM auth_email_tokens WHERE user_id = ? AND purpose = 'verify_email'")
      .bind(userId),
    env.DB.prepare(`
      INSERT INTO auth_email_tokens (token_hash, user_id, purpose, channel, expires_at)
      VALUES (?, ?, 'verify_email', 'link', datetime(CURRENT_TIMESTAMP, '+10 minutes'))
    `).bind(linkHash, userId),
    env.DB.prepare(`
      INSERT INTO auth_email_tokens (token_hash, user_id, purpose, channel, expires_at)
      VALUES (?, ?, 'verify_email', 'code', datetime(CURRENT_TIMESTAMP, '+10 minutes'))
    `).bind(codeHash, userId),
    env.DB.prepare(`
      INSERT INTO auth_email_verification_limits (user_id, attempts, locked_until)
      VALUES (?, 0, NULL)
      ON CONFLICT(user_id) DO UPDATE SET attempts = 0, locked_until = NULL
    `).bind(userId),
  ]);
  return { linkToken, verificationCode };
}

function emailLink(env, path, token) {
  const appUrl = String(env.APP_URL || 'https://www.theprimemarkets.com').trim().replace(/\/+$/, '');
  const url = new URL(path, appUrl);
  url.searchParams.set('token', token);
  return url.toString();
}

async function sendVerificationEmail(env, userId, email) {
  const credentials = await issueVerificationCredentials(env, userId);
  if (!credentials) return { sent: false, throttled: true };
  const link = emailLink(env, '/auth/confirm', credentials.linkToken);
  const sent = await sendEmail(env, {
    to: email,
    subject: 'Verify your Prime Markets email',
    text: `You're almost there. Confirm your email address to complete your account setup.\n\nYour verification code: ${credentials.verificationCode}\nEnter this 8-digit code in the app. It expires in 10 minutes.\n\nOr confirm using this link: ${link}\nThis link expires in 10 minutes. Use either method, not both. If you did not create this account, you can ignore this message.`,
    html: renderPrimeMarketsEmail({
      title: 'Confirm your email',
      preheader: 'Confirm your email address to complete your account setup.',
      body: "You're almost there. Confirm your email address to complete your account setup.",
      verificationCode: credentials.verificationCode,
      codeExpiryNote: 'This code expires in 10 minutes.',
      actionUrl: link,
      actionLabel: 'Confirm Email Address',
      actionNote: 'The link opens a confirmation page before your email is verified.',
      securityTip: 'Never share your verification code with anyone. The Prime Markets team will never ask you to provide this code.',
      expiryNote: 'This confirmation link expires in 10 minutes.',
    }),
  }, 'worker/auth');
  if (!sent) {
    await env.DB.prepare("DELETE FROM auth_email_tokens WHERE user_id = ? AND purpose = 'verify_email'")
      .bind(userId).run();
    return { sent: false, throttled: false };
  }
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
    html: renderPrimeMarketsEmail({
      title: 'Reset your password',
      body: 'Use the secure link below to choose a new password for your account.',
      actionUrl: link,
      actionLabel: 'Reset Password',
      securityTip: 'If you did not request a password reset, do not use this link and ignore this email.',
      expiryNote: 'This password reset link expires in 60 minutes.',
    }),
  }, 'worker/auth');
}

async function consumeEmailToken(env, token, purpose) {
  if (typeof token !== 'string' || token.length < 20 || token.length > 200) return null;
  return env.DB.prepare(`
    UPDATE auth_email_tokens SET consumed_at = CURRENT_TIMESTAMP
    WHERE token_hash = ? AND purpose = ? AND channel = 'link' AND consumed_at IS NULL AND expires_at > CURRENT_TIMESTAMP
    RETURNING user_id
  `).bind(await hashSessionToken(token), purpose).first();
}

async function consumeVerificationCode(env, userId, code) {
  const tokenHash = await hashVerificationCode(userId, code);
  return env.DB.prepare(`
    UPDATE auth_email_tokens SET consumed_at = CURRENT_TIMESTAMP
    WHERE token_hash = ? AND user_id = ? AND purpose = 'verify_email' AND channel = 'code'
      AND consumed_at IS NULL AND expires_at > CURRENT_TIMESTAMP
    RETURNING user_id
  `).bind(tokenHash, userId).first();
}

async function completeEmailVerification(env, userId) {
  await env.DB.batch([
    env.DB.prepare(`
      UPDATE auth_users SET email_verified_at = COALESCE(email_verified_at, CURRENT_TIMESTAMP)
      WHERE id = ?
    `).bind(userId),
    env.DB.prepare("DELETE FROM auth_email_tokens WHERE user_id = ? AND purpose = 'verify_email'")
      .bind(userId),
    env.DB.prepare('DELETE FROM auth_email_verification_limits WHERE user_id = ?').bind(userId),
  ]);
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

  const existing = await env.DB.prepare('SELECT id, email_verified_at FROM auth_users WHERE email = ?').bind(email).first();
  if (existing?.email_verified_at) return response({ error: 'An account with that email already exists.' }, 409);
  if (existing) {
    const delivery = await sendVerificationEmail(env, existing.id, email);
    return response({ verification_required: true, email_sent: delivery.sent, throttled: delivery.throttled }, 202);
  }

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

  const fullName = String(body?.full_name || email.split('@')[0]).trim().slice(0, 160);
  const phone = String(body?.phone || '').trim().slice(0, 60);
  const country = String(body?.country || '').trim().slice(0, 100);
  const referral = String(body?.referred_by || '').trim().toUpperCase().slice(0, 40);
  const referrer = referral
    ? await env.DB.prepare('SELECT user_id FROM profiles WHERE upper(referral_code) = ? AND user_id <> ? LIMIT 1')
      .bind(referral, userId).first()
    : null;
  await env.DB.prepare(`
    INSERT OR IGNORE INTO profiles (user_id, email, full_name, country, phone, referral_code, referred_by)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).bind(userId, email, fullName, country, phone, `APEX${userId.replace(/-/g, '').slice(0, 6).toUpperCase()}`, referrer?.user_id ? referral : null).run();

  const delivery = await sendVerificationEmail(env, userId, email);
  return response({ verification_required: true, email_sent: delivery.sent, throttled: delivery.throttled }, 202);
}

async function login(request, env) {
  const body = await readJson(request);
  const email = normalizeEmail(body?.email);
  const password = body?.password;
  if (!email || !validPassword(password)) return response({ error: 'Invalid email or password.' }, 401);

  const user = await env.DB.prepare('SELECT id, email, password_hash, created_at, email_verified_at FROM auth_users WHERE email = ?').bind(email).first();
  if (!user || !(await verifyPassword(password, user.password_hash))) return response({ error: 'Invalid email or password.' }, 401);
  if (!user.email_verified_at) return response({ error: 'Confirm your email before signing in. Check your inbox for the verification code or link.' }, 403);

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
    await completeEmailVerification(env, token.user_id);
  }
  return new Response(null, {
    status: 302,
    headers: { location: destination.toString(), 'cache-control': 'no-store' },
  });
}

async function resendVerification(request, env) {
  const user = await findUserBySession(request, env);
  const body = await readJson(request);
  const email = user?.email || normalizeEmail(body?.email);
  if (!email) return response({ ok: true });
  const account = await env.DB.prepare('SELECT id, email, email_verified_at FROM auth_users WHERE email = ?')
    .bind(email).first();
  if (!account || account.email_verified_at) return response({ ok: true });
  const delivery = await sendVerificationEmail(env, account.id, account.email);
  if (delivery.throttled) return response({ ok: true, throttled: true });
  if (!delivery.sent) return response({ error: 'Unable to send verification email. Please try again later.' }, 503);
  return response({ ok: true });
}

async function verifyEmailCode(request, env) {
  const body = await readJson(request);
  const email = normalizeEmail(body?.email);
  const code = String(body?.code || '').trim();
  if (!email || !/^\d{8}$/.test(code)) return response({ error: 'Enter the 8-digit code from your email.' }, 400);

  const account = await env.DB.prepare('SELECT id, email_verified_at FROM auth_users WHERE email = ?')
    .bind(email).first();
  if (!account) return response({ error: 'The verification code is invalid or expired.' }, 400);
  if (account.email_verified_at) return response({ ok: true, already_verified: true });

  const limits = await env.DB.prepare('SELECT attempts, locked_until FROM auth_email_verification_limits WHERE user_id = ?')
    .bind(account.id).first();
  if (limits?.locked_until && new Date(`${limits.locked_until.replace(' ', 'T')}Z`).getTime() > Date.now()) {
    return response({ error: 'Too many incorrect codes. Request a new verification email and try again.' }, 429);
  }

  const token = await consumeVerificationCode(env, account.id, code);
  if (!token) {
    await env.DB.prepare(`
      INSERT INTO auth_email_verification_limits (user_id, attempts, locked_until)
      VALUES (?, 1, NULL)
      ON CONFLICT(user_id) DO UPDATE SET
        attempts = attempts + 1,
        locked_until = CASE WHEN attempts >= 4 THEN datetime(CURRENT_TIMESTAMP, '+15 minutes') ELSE NULL END
    `).bind(account.id).run();
    const updated = await env.DB.prepare('SELECT locked_until FROM auth_email_verification_limits WHERE user_id = ?')
      .bind(account.id).first();
    const locked = Boolean(updated?.locked_until);
    return response({ error: locked
      ? 'Too many incorrect codes. Request a new verification email and try again.'
      : 'The verification code is invalid or expired.' }, locked ? 429 : 400);
  }

  await completeEmailVerification(env, account.id);
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
    if (request.method === 'POST' && url.pathname === '/api/auth/verification/confirm') return await verifyEmailCode(request, env);
    if (request.method === 'GET' && url.pathname === '/api/auth/verify-email') return await verifyEmail(request, env);
    if (request.method === 'POST' && url.pathname === '/api/auth/logout') return await logout(request, env);
    if (request.method === 'GET' && url.pathname === '/api/auth/session') return await session(request, env);
    return response({ error: 'Method not allowed' }, 405);
  } catch (error) {
    console.error('[worker/auth]', error);
    return response({ error: 'Internal server error' }, 500);
  }
}
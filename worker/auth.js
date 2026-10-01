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
    SELECT u.id, u.email, u.created_at
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

  const user = { id: userId, email, created_at: new Date().toISOString() };
  const token = await createSession(request, env, userId);
  return response({ user }, 201, sessionCookie(request, token));
}

async function login(request, env) {
  const body = await readJson(request);
  const email = normalizeEmail(body?.email);
  const password = body?.password;
  if (!email || !validPassword(password)) return response({ error: 'Invalid email or password.' }, 401);

  const user = await env.DB.prepare('SELECT id, email, password_hash, created_at FROM auth_users WHERE email = ?').bind(email).first();
  if (!user || !(await verifyPassword(password, user.password_hash))) return response({ error: 'Invalid email or password.' }, 401);

  const token = await createSession(request, env, user.id);
  return response({ user: publicUser(user) }, 200, sessionCookie(request, token));
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
    if (request.method === 'POST' && url.pathname === '/api/auth/logout') return await logout(request, env);
    if (request.method === 'GET' && url.pathname === '/api/auth/session') return await session(request, env);
    return response({ error: 'Method not allowed' }, 405);
  } catch (error) {
    console.error('[worker/auth]', error);
    return response({ error: 'Internal server error' }, 500);
  }
}
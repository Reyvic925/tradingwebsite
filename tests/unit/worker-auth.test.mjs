import assert from 'node:assert/strict';
import { getAuthenticatedUser, handleAuthRequest, hashPassword, verifyPassword } from '../../worker/auth.js';

class FakeD1 {
  constructor() {
    this.users = new Map();
    this.sessions = new Map();
    this.emailTokens = new Map();
    this.verificationLimits = new Map();
    this.profiles = new Map();
  }

  prepare(sql) {
    return new FakeStatement(this, sql);
  }

  async batch(statements) {
    const results = [];
    for (const statement of statements) results.push(await statement.run());
    return results;
  }
}

class FakeStatement {
  constructor(db, sql) {
    this.db = db;
    this.sql = sql.replace(/\s+/g, ' ').trim();
    this.values = [];
  }

  bind(...values) {
    this.values = values;
    return this;
  }

  async first() {
    if (this.sql.startsWith('SELECT id, email_verified_at FROM auth_users WHERE email =')) {
      const user = [...this.db.users.values()].find((candidate) => candidate.email === this.values[0]);
      return user ? { id: user.id, email_verified_at: user.email_verified_at } : null;
    }
    if (this.sql.startsWith('SELECT id, email, email_verified_at FROM auth_users WHERE email =')) {
      const user = [...this.db.users.values()].find((candidate) => candidate.email === this.values[0]);
      return user ? { id: user.id, email: user.email, email_verified_at: user.email_verified_at } : null;
    }
    if (this.sql.startsWith('SELECT attempts, locked_until FROM auth_email_verification_limits')) {
      return this.db.verificationLimits.get(this.values[0]) || null;
    }
    if (this.sql.startsWith('SELECT locked_until FROM auth_email_verification_limits')) {
      const limit = this.db.verificationLimits.get(this.values[0]);
      return limit ? { locked_until: limit.locked_until } : null;
    }
    if (this.sql.startsWith('SELECT token_hash FROM auth_email_tokens')) {
      const [userId, purpose] = this.values;
      const token = [...this.db.emailTokens.values()].find((candidate) => candidate.userId === userId
        && candidate.purpose === purpose && candidate.createdAt > Date.now() - 60_000);
      return token ? { token_hash: 'recent' } : null;
    }
    if (this.sql.startsWith('SELECT email FROM auth_users WHERE id =')) {
      const user = this.db.users.get(this.values[0]);
      return user ? { email: user.email } : null;
    }
    if (this.sql.startsWith('SELECT password_hash FROM auth_users WHERE id =')) {
      return this.db.users.get(this.values[0]) || null;
    }
    if (this.sql.startsWith('UPDATE auth_email_tokens SET consumed_at =')) {
      const [tokenHash, purposeOrUserId] = this.values;
      const token = this.db.emailTokens.get(tokenHash);
      const isCode = this.sql.includes("channel = 'code'");
      const matches = isCode
        ? token?.userId === purposeOrUserId && token.channel === 'code'
        : token?.purpose === purposeOrUserId && token.channel === 'link';
      if (!matches || token.consumed || token.expiresAt <= Date.now()) return null;
      token.consumed = true;
      return { user_id: token.userId };
    }
    if (this.sql.startsWith('SELECT id FROM auth_users WHERE email =')) {
      const user = [...this.db.users.values()].find((candidate) => candidate.email === this.values[0]);
      return user ? { id: user.id } : null;
    }
    if (this.sql.startsWith('SELECT id, email FROM auth_users WHERE email =')) {
      const user = [...this.db.users.values()].find((candidate) => candidate.email === this.values[0]);
      return user ? { id: user.id, email: user.email } : null;
    }
    if (this.sql.startsWith('SELECT id, email, password_hash, created_at')) {
      return [...this.db.users.values()].find((candidate) => candidate.email === this.values[0]) || null;
    }
    if (this.sql.startsWith('SELECT u.id, u.email, u.created_at')) {
      const session = this.db.sessions.get(this.values[0]);
      if (!session || session.expiresAt <= Date.now()) return null;
      const user = this.db.users.get(session.userId);
      return user ? { id: user.id, email: user.email, created_at: user.created_at } : null;
    }
    return null;
  }

  async run() {
    if (this.sql.startsWith('DELETE FROM auth_email_verification_limits')) {
      this.db.verificationLimits.delete(this.values[0]);
      return { success: true };
    }
    if (this.sql.startsWith('UPDATE auth_users SET password_hash =')) {
      const [passwordHash, id] = this.values;
      const user = this.db.users.get(id);
      if (!user) return { success: true, meta: { changes: 0 } };
      user.password_hash = passwordHash;
      return { success: true, meta: { changes: 1 } };
    }
    if (this.sql.startsWith('UPDATE auth_users SET email_verified_at =')) {
      const user = this.db.users.get(this.values[0]);
      if (!user) return { success: true, meta: { changes: 0 } };
      user.email_verified_at = new Date().toISOString();
      return { success: true, meta: { changes: 1 } };
    }
    if (this.sql.startsWith('DELETE FROM auth_email_tokens WHERE user_id =')) {
      const [userId, purpose] = this.values;
      for (const [hash, token] of this.db.emailTokens) {
        if (token.userId === userId && token.purpose === purpose) this.db.emailTokens.delete(hash);
      }
      return { success: true };
    }
    if (this.sql.startsWith('INSERT INTO auth_email_tokens')) {
      const [tokenHash, userId, purposeValue, expiry] = this.values;
      const code = this.sql.includes("'code'");
      const purpose = purposeValue || 'verify_email';
      const minutes = Number(String(expiry || '+10 minutes').match(/\+(\d+)/)?.[1] || 0);
      this.db.emailTokens.set(tokenHash, {
        userId,
        purpose,
        channel: code ? 'code' : 'link',
        expiresAt: Date.now() + minutes * 60 * 1000,
        createdAt: Date.now(),
        consumed: false,
      });
      return { success: true };
    }
    if (this.sql.startsWith('INSERT OR IGNORE INTO profiles')) {
      const [userId, email, fullName, country, phone, referralCode, referredBy] = this.values;
      this.db.profiles.set(userId, { user_id: userId, email, full_name: fullName, country, phone, referral_code: referralCode, referred_by: referredBy });
      return { success: true };
    }
    if (this.sql.startsWith('INSERT INTO auth_email_verification_limits')) {
      const userId = this.values[0];
      const limit = this.db.verificationLimits.get(userId) || { attempts: 0, locked_until: null };
      limit.attempts += 1;
      if (limit.attempts >= 5) limit.locked_until = new Date(Date.now() + 15 * 60 * 1000).toISOString();
      this.db.verificationLimits.set(userId, limit);
      return { success: true };
    }
    if (this.sql.startsWith('INSERT INTO auth_users')) {
      const [id, email, passwordHash] = this.values;
      if ([...this.db.users.values()].some((user) => user.email === email)) throw new Error('UNIQUE constraint failed');
      this.db.users.set(id, { id, email, password_hash: passwordHash, email_verified_at: null, created_at: new Date().toISOString() });
      return { success: true };
    }
    if (this.sql.startsWith('INSERT INTO auth_sessions')) {
      const [id, userId] = this.values;
      this.db.sessions.set(id, { userId, expiresAt: Date.now() + 30 * 24 * 60 * 60 * 1000 });
      return { success: true };
    }
    if (this.sql.startsWith('DELETE FROM auth_sessions')) {
      if (this.sql.includes('AND id !=')) {
        const [userId, keepId] = this.values;
        for (const [id, session] of this.db.sessions) {
          if (session.userId === userId && id !== keepId) this.db.sessions.delete(id);
        }
      } else {
        this.db.sessions.delete(this.values[0]);
      }
      return { success: true };
    }
    throw new Error(`Unhandled SQL: ${this.sql}`);
  }
}

const sentEmails = [];
const originalFetch = globalThis.fetch;
globalThis.fetch = async (url, options) => {
  sentEmails.push({ url, payload: JSON.parse(options.body) });
  return new Response(JSON.stringify({ id: `email-${sentEmails.length}` }), { status: 200 });
};
const env = {
  DB: new FakeD1(),
  REGISTRATION_ENABLED: 'true',
  RESEND_API_KEY: 'test-resend-key',
  RESEND_FROM_EMAIL: 'The Prime Markets <alerts@example.com>',
  APP_URL: 'https://www.theprimemarkets.com',
};
const request = (path, options = {}) => new Request(`http://localhost${path}`, options);
const cookieFrom = (response) => response.headers.get('set-cookie').split(';')[0];

const hash = await hashPassword('correct horse battery staple');
assert.equal(await verifyPassword('correct horse battery staple', hash), true);
assert.equal(await verifyPassword('wrong password', hash), false);

const closedRegistrationEnv = { DB: new FakeD1() };
const closedSignup = await handleAuthRequest(request('/api/auth/signup', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ email: 'closed@example.com', password: 'correct horse battery staple' }),
}), closedRegistrationEnv);
assert.equal(closedSignup.status, 503);
assert.equal(closedRegistrationEnv.DB.users.size, 0);

const signup = await handleAuthRequest(request('/api/auth/signup', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ email: 'Trader@Example.com', password: 'correct horse battery staple' }),
}), env);
assert.equal(signup.status, 202);
assert.equal((await signup.json()).verification_required, true);
assert.equal(signup.headers.get('set-cookie'), null);
assert.equal(sentEmails.at(-1).payload.subject, 'Verify your Prime Markets email');
const verificationLink = new URL(sentEmails.at(-1).payload.text.match(/https:\/\/\S+/)[0]);
assert.equal(verificationLink.pathname, '/auth/confirm');
assert.match(sentEmails.at(-1).payload.html, /Confirm Email Address/);
assert.match(sentEmails.at(-1).payload.html, /Your verification code/);
assert.match(sentEmails.at(-1).payload.html, /expires in 10 minutes/);
assert.match(sentEmails.at(-1).payload.html, /background-color:#f2efe9/);
const verificationCode = sentEmails.at(-1).payload.html.match(/letter-spacing:8px[^>]*>(\d{8})</)?.[1];
assert.match(verificationCode || '', /^\d{8}$/);
assert.equal([...env.DB.users.values()][0].email_verified_at, null);
const pendingLogin = await handleAuthRequest(request('/api/auth/login', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ email: 'trader@example.com', password: 'correct horse battery staple' }),
}), env);
assert.equal(pendingLogin.status, 403);
assert.equal(pendingLogin.headers.get('set-cookie'), null);
const verifyUrl = new URL('/api/auth/verify-email', 'http://localhost');
verifyUrl.searchParams.set('token', verificationLink.searchParams.get('token'));
const verified = await handleAuthRequest(request(`${verifyUrl.pathname}${verifyUrl.search}`), env);
assert.equal(verified.status, 302);
assert.equal(new URL(verified.headers.get('location')).searchParams.get('email_verified'), '1');
assert.ok([...env.DB.users.values()][0].email_verified_at);
const reusedVerification = await handleAuthRequest(request(`${verifyUrl.pathname}${verifyUrl.search}`), env);
assert.equal(new URL(reusedVerification.headers.get('location')).searchParams.get('email_verified'), '0');

const duplicate = await handleAuthRequest(request('/api/auth/signup', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ email: 'trader@example.com', password: 'correct horse battery staple' }),
}), env);
assert.equal(duplicate.status, 409);

const otpSignup = await handleAuthRequest(request('/api/auth/signup', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ email: 'otp@example.com', password: 'correct horse battery staple' }),
}), env);
assert.equal(otpSignup.status, 202);
const otpCode = sentEmails.at(-1).payload.html.match(/letter-spacing:8px[^>]*>(\d{8})</)?.[1];
assert.match(otpCode || '', /^\d{8}$/);
const otpUser = [...env.DB.users.values()].find((user) => user.email === 'otp@example.com');
const otpMaterial = await crypto.subtle.importKey('raw', new TextEncoder().encode(otpCode), 'PBKDF2', false, ['deriveBits']);
const otpSalt = new TextEncoder().encode(otpUser.id);
const otpBits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: otpSalt, iterations: 100000, hash: 'SHA-256' }, otpMaterial, 256);
const otpEncoded = `100000$${btoa(String.fromCharCode(...otpSalt)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')}$${btoa(String.fromCharCode(...new Uint8Array(otpBits))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')}`;
const otpHashBytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(otpEncoded));
const otpHash = btoa(String.fromCharCode(...new Uint8Array(otpHashBytes))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
const otpToken = env.DB.emailTokens.get(otpHash);
assert.equal(otpToken.channel, 'code');
const otpVerified = await handleAuthRequest(request('/api/auth/verification/confirm', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ email: 'otp@example.com', code: otpCode }),
}), env);
assert.equal(otpVerified.status, 200);
assert.ok(otpUser.email_verified_at);
const cookie = cookieFrom(await handleAuthRequest(request('/api/auth/login', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ email: 'trader@example.com', password: 'correct horse battery staple' }),
}), env));

const login = await handleAuthRequest(request('/api/auth/login', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ email: 'TRADER@example.com', password: 'correct horse battery staple' }),
}), env);
assert.equal(login.status, 200);
const loginCookie = cookieFrom(login);

const invalidPassword = await handleAuthRequest(request('/api/auth/login', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ email: 'trader@example.com', password: 'not the password' }),
}), env);
assert.equal(invalidPassword.status, 401);

const session = await handleAuthRequest(request('/api/auth/session', { headers: { cookie: loginCookie } }), env);
assert.equal(session.status, 200);
assert.equal((await session.json()).user.email, 'trader@example.com');

const authenticated = await getAuthenticatedUser(request('/api/protected', { headers: { cookie: loginCookie } }), env);
assert.equal(authenticated.email, 'trader@example.com');
const unauthenticated = await getAuthenticatedUser(request('/api/protected'), env);
assert.equal(unauthenticated, null);

const passwordChanged = await handleAuthRequest(request('/api/auth/password', {
  method: 'POST',
  headers: { 'content-type': 'application/json', cookie: loginCookie },
  body: JSON.stringify({ current_password: 'correct horse battery staple', new_password: 'another secure password' }),
}), env);
assert.equal(passwordChanged.status, 200);
assert.deepEqual(await passwordChanged.json(), { ok: true });
const currentPasswordSession = await handleAuthRequest(request('/api/auth/session', { headers: { cookie: loginCookie } }), env);
assert.equal((await currentPasswordSession.json()).user.email, 'trader@example.com');
const revokedOlderSession = await handleAuthRequest(request('/api/auth/session', { headers: { cookie } }), env);
assert.equal((await revokedOlderSession.json()).user, null);
const changedPasswordLogin = await handleAuthRequest(request('/api/auth/login', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ email: 'trader@example.com', password: 'another secure password' }),
}), env);
assert.equal(changedPasswordLogin.status, 200);
assert.equal(sentEmails.at(-1).payload.subject, 'Your Prime Markets password was changed');

const wrongCurrentPassword = await handleAuthRequest(request('/api/auth/password', {
  method: 'POST',
  headers: { 'content-type': 'application/json', cookie: loginCookie },
  body: JSON.stringify({ current_password: 'incorrect password', new_password: 'third secure password' }),
}), env);
assert.equal(wrongCurrentPassword.status, 403);

const resetRequested = await handleAuthRequest(request('/api/auth/password-reset/request', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ email: 'TRADER@example.com' }),
}), env);
assert.equal(resetRequested.status, 200);
assert.deepEqual(await resetRequested.json(), { ok: true });
assert.equal(sentEmails.at(-1).payload.subject, 'Reset your Prime Markets password');
assert.match(sentEmails.at(-1).payload.html, /Reset Password/);
assert.match(sentEmails.at(-1).payload.html, /expires in 60 minutes/);
const emailCountAfterResetRequest = sentEmails.length;
const repeatedResetRequest = await handleAuthRequest(request('/api/auth/password-reset/request', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ email: 'trader@example.com' }),
}), env);
assert.equal(repeatedResetRequest.status, 200);
assert.equal(sentEmails.length, emailCountAfterResetRequest);
const resetLink = new URL(sentEmails.at(-1).payload.text.match(/https:\/\/\S+/)[0]);
const passwordReset = await handleAuthRequest(request('/api/auth/password-reset/confirm', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ token: resetLink.searchParams.get('token'), new_password: 'reset secure password' }),
}), env);
assert.equal(passwordReset.status, 200);
const resetLogin = await handleAuthRequest(request('/api/auth/login', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ email: 'trader@example.com', password: 'reset secure password' }),
}), env);
assert.equal(resetLogin.status, 200);
const resetSession = cookieFrom(resetLogin);
assert.equal((await (await handleAuthRequest(request('/api/auth/session', { headers: { cookie: resetSession } }), env)).json()).user.email, 'trader@example.com');
const reusedReset = await handleAuthRequest(request('/api/auth/password-reset/confirm', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ token: resetLink.searchParams.get('token'), new_password: 'another reset password' }),
}), env);
assert.equal(reusedReset.status, 400);

const logout = await handleAuthRequest(request('/api/auth/logout', { method: 'POST', headers: { cookie: loginCookie } }), env);
assert.equal(logout.status, 200);
const afterLogout = await handleAuthRequest(request('/api/auth/session', { headers: { cookie: loginCookie } }), env);
assert.equal((await afterLogout.json()).user, null);

const expiredCookie = 'apex_session=expired-token';
env.DB.sessions.set(await (async () => {
  const data = new TextEncoder().encode('expired-token');
  const digest = await crypto.subtle.digest('SHA-256', data);
  return btoa(String.fromCharCode(...new Uint8Array(digest))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
})(), { userId: [...env.DB.users.keys()][0], expiresAt: Date.now() - 1 });
const expired = await handleAuthRequest(request('/api/auth/session', { headers: { cookie: expiredCookie } }), env);
assert.equal((await expired.json()).user, null);

console.log('WORKER_AUTH_TESTS_PASSED');
globalThis.fetch = originalFetch;
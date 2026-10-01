import assert from 'node:assert/strict';
import { getAuthenticatedUser, handleAuthRequest, hashPassword, verifyPassword } from '../../worker/auth.js';

class FakeD1 {
  constructor() {
    this.users = new Map();
    this.sessions = new Map();
  }

  prepare(sql) {
    return new FakeStatement(this, sql);
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
    if (this.sql.startsWith('SELECT id FROM auth_users WHERE email =')) {
      const user = [...this.db.users.values()].find((candidate) => candidate.email === this.values[0]);
      return user ? { id: user.id } : null;
    }
    if (this.sql.startsWith('SELECT id, email, password_hash, created_at FROM auth_users WHERE email =')) {
      return [...this.db.users.values()].find((candidate) => candidate.email === this.values[0]) || null;
    }
    if (this.sql.startsWith('SELECT u.id, u.email, u.created_at FROM auth_sessions')) {
      const session = this.db.sessions.get(this.values[0]);
      if (!session || session.expiresAt <= Date.now()) return null;
      const user = this.db.users.get(session.userId);
      return user ? { id: user.id, email: user.email, created_at: user.created_at } : null;
    }
    return null;
  }

  async run() {
    if (this.sql.startsWith('INSERT INTO auth_users')) {
      const [id, email, passwordHash] = this.values;
      if ([...this.db.users.values()].some((user) => user.email === email)) throw new Error('UNIQUE constraint failed');
      this.db.users.set(id, { id, email, password_hash: passwordHash, created_at: new Date().toISOString() });
      return { success: true };
    }
    if (this.sql.startsWith('INSERT INTO auth_sessions')) {
      const [id, userId] = this.values;
      this.db.sessions.set(id, { userId, expiresAt: Date.now() + 30 * 24 * 60 * 60 * 1000 });
      return { success: true };
    }
    if (this.sql.startsWith('DELETE FROM auth_sessions')) {
      this.db.sessions.delete(this.values[0]);
      return { success: true };
    }
    throw new Error(`Unhandled SQL: ${this.sql}`);
  }
}

const env = { DB: new FakeD1(), REGISTRATION_ENABLED: 'true' };
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
assert.equal(signup.status, 201);
assert.deepEqual((await signup.json()).user.email, 'trader@example.com');
const cookie = cookieFrom(signup);
assert.match(signup.headers.get('set-cookie'), /HttpOnly/);
assert.doesNotMatch(signup.headers.get('set-cookie'), /password|battery|staple/i);

const duplicate = await handleAuthRequest(request('/api/auth/signup', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ email: 'trader@example.com', password: 'correct horse battery staple' }),
}), env);
assert.equal(duplicate.status, 409);

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
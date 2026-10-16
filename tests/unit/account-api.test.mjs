import assert from 'node:assert/strict';
import { handleAccountRequest } from '../../worker/account-api.js';

const user = {
  id: 'user-1',
  email: 'trader@example.com',
  created_at: '2026-10-01 12:00:00',
  email_verified_at: '2026-10-01 12:05:00',
};
const profile = { user_id: user.id, email: user.email, role: 'user' };
const wallet = { id: 1, user_id: user.id, currency: 'USD', available: 0, reserved: 0, locked_balance: 0 };
const statements = [];

const db = {
  prepare(sql) {
    statements.push(sql.replace(/\s+/g, ' ').trim());
    return {
      bind() {
        return this;
      },
      async first() {
        if (sql.includes('FROM auth_sessions s')) return user;
        if (sql.includes('SELECT * FROM profiles')) return profile;
        if (sql.includes('FROM wallets')) return wallet;
        throw new Error(`Unexpected first() query: ${sql}`);
      },
      async run() {
        return { success: true };
      },
    };
  },
};

const response = await handleAccountRequest(
  new Request('https://example.com/api/profile', {
    headers: { cookie: 'apex_session=test-session' },
  }),
  { DB: db },
);

assert.equal(response.status, 200);
assert.deepEqual(await response.json(), { profile, wallet });
assert.equal(statements.some((sql) => sql.includes('crypto_addresses') || sql.includes('user_mnemonics')), false,
  'Profile load must not generate deposit wallets during login');

console.log('ACCOUNT_API_TESTS_PASSED');

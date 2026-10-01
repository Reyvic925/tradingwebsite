import assert from 'node:assert/strict';
import { handleReferralRequest } from '../../worker/referral-api.js';

class FakeDatabase {
  constructor() {
    this.queries = [];
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
    if (this.sql.startsWith('SELECT u.id, u.email, u.created_at')) {
      return { id: 'referrer-1', email: 'referrer@example.com', created_at: '2026-01-01' };
    }
    if (this.sql.startsWith('SELECT referral_code FROM profiles')) return { referral_code: 'APEXABC123' };
    return null;
  }

  async all() {
    this.db.queries.push({ sql: this.sql, values: this.values });
    return { results: [
      { id: 2, referred_email: 'client@example.com', bonus: 12.5, status: 'earned', created_at: '2026-02-01' },
      { id: 3, referred_email: 'new@example.com', bonus: 0, status: 'pending', created_at: '2026-03-01' },
    ] };
  }
}

const db = new FakeDatabase();
const env = { DB: db };
const request = new Request('https://example.com/api/referrals', {
  headers: { cookie: 'apex_session=test-session' },
});

const response = await handleReferralRequest(request, env);
assert.equal(response.status, 200);
assert.deepEqual(await response.json(), {
  code: 'APEXABC123',
  referrals: [
    { id: 2, referred_email: 'client@example.com', bonus: 12.5, status: 'earned', created_at: '2026-02-01' },
    { id: 3, referred_email: 'new@example.com', bonus: 0, status: 'pending', created_at: '2026-03-01' },
  ],
  total_bonus: 12.5,
  count: 2,
});
assert.deepEqual(db.queries[0].values, ['APEXABC123', 'referrer-1']);

const unauthorized = await handleReferralRequest(new Request('https://example.com/api/referrals'), env);
assert.equal(unauthorized.status, 401);

const wrongMethod = await handleReferralRequest(new Request('https://example.com/api/referrals', { method: 'POST' }), env);
assert.equal(wrongMethod.status, 405);

console.log('REFERRAL_API_TESTS_PASSED');
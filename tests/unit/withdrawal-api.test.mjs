import assert from 'node:assert/strict';
import { handleWithdrawalRequest } from '../../worker/withdrawal-api.js';

const toBase64Url = (bytes) => Buffer.from(bytes).toString('base64url');

async function sessionCookie(token, userId) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return { id: toBase64Url(new Uint8Array(digest)), userId };
}

class FakeD1 {
  constructor() {
    this.users = new Map([
      ['user-1', { id: 'user-1', email: 'user@example.com', created_at: '2026-01-01' }],
      ['admin-1', { id: 'admin-1', email: 'admin@example.com', created_at: '2026-01-01' }],
    ]);
    this.sessions = new Map();
    this.profiles = new Map([
      ['user-1', { role: 'user', kyc_status: 'verified', email: 'user@example.com', full_name: 'Test User' }],
      ['admin-1', { role: 'admin', kyc_status: 'verified', email: 'admin@example.com', full_name: 'Test Admin' }],
    ]);
    this.wallet = { user_id: 'user-1', currency: 'USD', available: 80 };
    this.transactions = [];
    this.ledger = [];
    this.notifications = [];
    this.audit = [];
    this.nextId = 1;
  }

  prepare(sql) {
    return new FakeStatement(this, sql);
  }

  async batch(statements) {
    const results = [];
    let changes = 0;
    for (const statement of statements) {
      const { sql, values } = statement;
      if (sql.startsWith('UPDATE wallets SET available = available -')) {
        const [amount, userId, minimum] = values;
        changes = this.wallet.user_id === userId && this.wallet.available >= minimum ? 1 : 0;
        if (changes) this.wallet.available -= amount;
        results.push({ meta: { changes } });
      } else if (sql.startsWith('INSERT INTO transactions (user_id, type, amount, currency, method, status, reference, external_address)')) {
        const [userId, amount, currency, reference, address] = values;
        const rows = changes
          ? [{ id: this.nextId++, user_id: userId, type: 'withdrawal', amount, currency, method: 'crypto', status: 'pending', reference, external_address: address }]
          : [];
        this.transactions.push(...rows);
        changes = rows.length;
        results.push({ results: rows, meta: { changes } });
      } else if (sql.startsWith('INSERT INTO wallet_ledger')) {
        const [referenceOrAdminId, transactionId, reviewerId, reviewedAt] = values;
        if (sql.includes("'withdrawal_debit'")) {
          const transaction = this.transactions.find((row) => row.reference === referenceOrAdminId);
          if (transaction) this.ledger.push({ entry_type: 'debit', source_type: 'withdrawal_debit', source_id: transaction.id, amount: transaction.amount });
        } else {
          const transaction = this.transactions.find((row) => row.id === transactionId);
          if (transaction && transaction.status === 'rejected' && transaction.reviewed_by === reviewerId && transaction.reviewed_at === reviewedAt) {
            this.ledger.push({ entry_type: 'credit', source_type: 'withdrawal_refund', source_id: transaction.id, amount: transaction.amount, created_by: referenceOrAdminId });
          }
        }
        changes = 1;
        results.push({ meta: { changes } });
      } else if (sql.startsWith('UPDATE transactions')) {
        const [status, reviewedAt, reviewerId, notes, id] = values;
        const transaction = this.transactions.find((row) => row.id === id && row.type === 'withdrawal' && row.status === 'pending');
        const rows = transaction ? [transaction] : [];
        if (transaction) Object.assign(transaction, { status, reviewed_at: reviewedAt, reviewed_by: reviewerId, admin_notes: notes });
        changes = rows.length;
        results.push({ results: rows, meta: { changes } });
      } else if (sql.startsWith('UPDATE wallets SET available = available +')) {
        const [id, reviewedAt, lookupId, lookupAt] = values;
        const transaction = this.transactions.find((row) => row.id === id && row.status === 'rejected' && row.reviewed_at === reviewedAt);
        const matches = changes === 1 && transaction && transaction.id === lookupId && transaction.reviewed_at === lookupAt;
        if (matches) this.wallet.available += transaction.amount;
        changes = matches ? 1 : 0;
        results.push({ meta: { changes } });
      } else if (sql.startsWith('INSERT INTO admin_audit_logs')) {
        this.audit.push(values);
        changes = 1;
        results.push({ meta: { changes } });
      } else {
        throw new Error(`Unhandled batch SQL: ${sql}`);
      }
    }
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
    if (this.sql.startsWith('SELECT u.id, u.email, u.created_at')) {
      const session = this.db.sessions.get(this.values[0]);
      return session ? this.db.users.get(session.userId) || null : null;
    }
    if (this.sql.startsWith('SELECT kyc_status FROM profiles')) {
      const profile = this.db.profiles.get(this.values[0]);
      return profile ? { kyc_status: profile.kyc_status } : null;
    }
    if (this.sql.startsWith('SELECT role FROM profiles')) {
      return this.db.profiles.get(this.values[0]) || null;
    }
    throw new Error(`Unhandled first SQL: ${this.sql}`);
  }

  async run() {
    if (this.sql.startsWith('INSERT INTO notifications')) {
      this.db.notifications.push(this.values);
      return { success: true, meta: { changes: 1 } };
    }
    throw new Error(`Unhandled run SQL: ${this.sql}`);
  }

  async all() {
    if (this.sql.startsWith('SELECT t.*, p.email AS user_email')) {
      const [status] = this.values;
      return { results: this.db.transactions.filter((row) => status === 'all' || row.status === status) };
    }
    throw new Error(`Unhandled all SQL: ${this.sql}`);
  }
}

const db = new FakeD1();
db.sessions.set((await sessionCookie('user-token', 'user-1')).id, { userId: 'user-1' });
db.sessions.set((await sessionCookie('admin-token', 'admin-1')).id, { userId: 'admin-1' });
const env = { DB: db, ADMIN_EMAILS: 'admin@example.com' };
const request = (path, token, options = {}) => new Request(`http://localhost${path}`, {
  ...options,
  headers: { cookie: `apex_session=${token}`, ...(options.headers || {}) },
});

const created = await handleWithdrawalRequest(request('/api/user/withdraw/crypto', 'user-token', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ amount: 35, currency: 'USDT', address: 'T-test-destination' }),
}), env);
assert.equal(created.status, 201);
const createdBody = await created.json();
assert.equal(createdBody.tx.external_address, 'T-test-destination');
assert.equal(db.wallet.available, 45);
assert.equal(db.ledger.length, 1);

const rejected = await handleWithdrawalRequest(request('/api/admin/withdrawals', 'admin-token', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ id: createdBody.tx.id, action: 'reject', admin_notes: 'Address could not be verified' }),
}), env);
assert.equal(rejected.status, 200);
assert.equal((await rejected.json()).withdrawal.status, 'rejected');
assert.equal(db.wallet.available, 80);
assert.equal(db.ledger.length, 2);
assert.equal(db.ledger[1].source_type, 'withdrawal_refund');

const duplicateReview = await handleWithdrawalRequest(request('/api/admin/withdrawals', 'admin-token', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ id: createdBody.tx.id, action: 'reject' }),
}), env);
assert.equal(duplicateReview.status, 409);
assert.equal(db.wallet.available, 80);
assert.equal(db.ledger.length, 2);

const secondCreated = await handleWithdrawalRequest(request('/api/user/withdraw/crypto', 'user-token', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ amount: 10, currency: 'USDC', address: '0x-test-destination' }),
}), env);
assert.equal(secondCreated.status, 201);
const secondBody = await secondCreated.json();
assert.equal(db.wallet.available, 70);

const approved = await handleWithdrawalRequest(request('/api/admin/withdrawals', 'admin-token', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ id: secondBody.tx.id, action: 'approve', admin_notes: 'Checks passed' }),
}), env);
assert.equal(approved.status, 200);
assert.equal((await approved.json()).withdrawal.status, 'approved');
assert.equal(db.wallet.available, 70);
assert.equal(db.ledger.length, 3);

const noKycDb = new FakeD1();
noKycDb.sessions.set((await sessionCookie('user-token-2', 'user-1')).id, { userId: 'user-1' });
noKycDb.profiles.get('user-1').kyc_status = 'pending';
const noKyc = await handleWithdrawalRequest(request('/api/user/withdraw/crypto', 'user-token-2', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ amount: 10, currency: 'USDT', address: 'T-test-destination' }),
}), { ...env, DB: noKycDb });
assert.equal(noKyc.status, 403);
assert.equal(noKycDb.wallet.available, 80);

console.log('WITHDRAWAL_API_TESTS_PASSED');
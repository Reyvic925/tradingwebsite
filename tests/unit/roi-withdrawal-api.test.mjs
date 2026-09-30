import assert from 'node:assert/strict';
import { handleRoiWithdrawalRequest } from '../../worker/roi-withdrawal-api.js';

const sessionId = async (token) => {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return Buffer.from(digest).toString('base64url');
};

class FakeD1 {
  constructor() {
    this.users = new Map([
      ['user-1', { id: 'user-1', email: 'user@example.com', created_at: '2026-01-01' }],
      ['admin-1', { id: 'admin-1', email: 'admin@example.com', created_at: '2026-01-01' }],
    ]);
    this.sessions = new Map();
    this.profiles = new Map([
      ['user-1', { user_id: 'user-1', role: 'user', kyc_status: 'verified', locked_balance: 50, email: 'user@example.com', full_name: 'Test User' }],
      ['admin-1', { user_id: 'admin-1', role: 'admin', kyc_status: 'verified', locked_balance: 0, email: 'admin@example.com' }],
    ]);
    this.investments = new Map([
      [55, { id: 55, user_id: 'user-1', plan_name: 'Starter', amount: 100, current_value: 130, status: 'completed', roi_withdrawal_pending: 0 }],
    ]);
    this.wallet = { user_id: 'user-1', currency: 'USD', available: 20 };
    this.withdrawals = [];
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
      if (sql.startsWith('UPDATE profiles SET locked_balance = locked_balance -')) {
        const [amount, userId, minimum] = values;
        const profile = this.profiles.get(userId);
        changes = profile && profile.locked_balance >= minimum ? 1 : 0;
        if (changes) profile.locked_balance -= amount;
        results.push({ meta: { changes } });
      } else if (sql.startsWith('UPDATE wallets SET available = available -')) {
        const [amount, userId, minimum] = values;
        changes = this.wallet.user_id === userId && this.wallet.available >= minimum ? 1 : 0;
        if (changes) this.wallet.available -= amount;
        results.push({ meta: { changes } });
      } else if (sql.startsWith('INSERT INTO withdrawals')) {
        let row = null;
        if (changes === 1 && sql.includes("'roi'")) {
          const [operationId, userId, investmentId, amount, currency] = values;
          row = { id: this.nextId++, operation_id: operationId, user_id: userId, investment_id: investmentId, type: 'roi', amount, currency, status: 'pending', fee_stage: 'awaiting_activation_fee', from_locked_balance: 1 };
        } else if (changes === 1 && sql.includes("'regular'")) {
          const [operationId, userId, amount, currency] = values;
          row = { id: this.nextId++, operation_id: operationId, user_id: userId, investment_id: null, type: 'regular', amount, currency, status: 'pending', fee_stage: 'awaiting_activation_fee', deducted_from_available: 1 };
        }
        if (row) this.withdrawals.push(row);
        changes = row ? 1 : 0;
        results.push({ results: row ? [row] : [], meta: { changes } });
      } else if (sql.startsWith('UPDATE investments SET roi_withdrawal_pending = 1')) {
        const [investmentId, userId, operationId] = values;
        const withdrawal = this.withdrawals.find((row) => row.operation_id === operationId && row.user_id === userId);
        const investment = this.investments.get(investmentId);
        changes = withdrawal && investment ? 1 : 0;
        if (changes) investment.roi_withdrawal_pending = 1;
        results.push({ meta: { changes } });
      } else if (sql.startsWith('UPDATE withdrawals')) {
        const [status, notes, approvedAt, processedAt, adminId, id] = values;
        const withdrawal = this.withdrawals.find((row) => row.id === id && row.type === 'roi' && row.status === 'pending');
        if (withdrawal) Object.assign(withdrawal, { status, admin_notes: notes, approved_at: approvedAt, processed_at: processedAt, processed_by: adminId });
        changes = withdrawal ? 1 : 0;
        results.push({ results: withdrawal ? [withdrawal] : [], meta: { changes } });
      } else if (sql.startsWith('UPDATE wallets SET available = available +')) {
        const [id, adminId, processedAt, lookupId, lookupAdmin, lookupAt] = values;
        const withdrawal = this.withdrawals.find((row) => row.id === id && row.type === 'roi' && row.status === 'approved' && row.processed_by === adminId && row.processed_at === processedAt);
        const valid = changes === 1 && withdrawal && withdrawal.id === lookupId && withdrawal.processed_by === lookupAdmin && withdrawal.processed_at === lookupAt;
        if (valid) this.wallet.available += withdrawal.amount;
        changes = valid ? 1 : 0;
        results.push({ meta: { changes } });
      } else if (sql.startsWith('UPDATE profiles SET locked_balance = locked_balance +')) {
        const [id, adminId, processedAt, lookupId, lookupAdmin, lookupAt] = values;
        const withdrawal = this.withdrawals.find((row) => row.id === id && row.type === 'roi' && row.status === 'rejected' && row.processed_by === adminId && row.processed_at === processedAt);
        const valid = changes === 1 && withdrawal && withdrawal.id === lookupId && withdrawal.processed_by === lookupAdmin && withdrawal.processed_at === lookupAt;
        if (valid) this.profiles.get(withdrawal.user_id).locked_balance += withdrawal.amount;
        changes = valid ? 1 : 0;
        results.push({ meta: { changes } });
      } else if (sql.startsWith('UPDATE investments SET roi_withdrawal_pending = 0')) {
        const [id, status, adminId, processedAt] = values;
        const withdrawal = this.withdrawals.find((row) => row.id === id && row.status === status && row.processed_by === adminId && row.processed_at === processedAt);
        if (withdrawal && this.investments.has(withdrawal.investment_id)) this.investments.get(withdrawal.investment_id).roi_withdrawal_pending = 0;
        changes = withdrawal ? 1 : 0;
        results.push({ meta: { changes } });
      } else if (sql.startsWith('INSERT INTO wallet_ledger')) {
        if (sql.includes("'withdrawal_request'")) {
          const withdrawal = this.withdrawals.find((row) => row.operation_id === values[0]);
          if (withdrawal) this.ledger.push({ entry_type: 'debit', source_type: 'withdrawal_request', source_id: withdrawal.id, amount: withdrawal.amount });
        } else if (sql.includes("'roi_withdrawal'")) {
          const [adminId, id, reviewerId, processedAt] = values;
          const withdrawal = this.withdrawals.find((row) => row.id === id && row.status === 'approved' && row.processed_by === reviewerId && row.processed_at === processedAt);
          if (withdrawal) this.ledger.push({ entry_type: 'credit', source_type: 'roi_withdrawal', source_id: withdrawal.id, amount: withdrawal.amount, created_by: adminId });
        }
        changes = 1;
        results.push({ meta: { changes } });
      } else if (sql.startsWith('INSERT INTO notifications')) {
        if (sql.includes("FROM withdrawals WHERE operation_id = ?")) {
          this.notifications.push({ user_id: sql.includes('ROI withdrawal initiated') ? 'user-1' : 'user-1', values });
        } else {
          this.notifications.push({ values });
        }
        changes = 1;
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
    if (this.sql.startsWith('SELECT u.id, u.email, u.created_at FROM auth_sessions')) {
      const session = this.db.sessions.get(this.values[0]);
      return session ? this.db.users.get(session.userId) || null : null;
    }
    if (this.sql.startsWith('SELECT role FROM profiles')) return this.db.profiles.get(this.values[0]) || null;
    if (this.sql.startsWith('SELECT kyc_status FROM profiles')) {
      const profile = this.db.profiles.get(this.values[0]);
      return profile ? { kyc_status: profile.kyc_status } : null;
    }
    if (this.sql.startsWith('SELECT id FROM investments WHERE id =')) {
      const investment = this.db.investments.get(this.values[0]);
      return investment?.user_id === this.values[1] ? { id: investment.id } : null;
    }
    throw new Error(`Unhandled first SQL: ${this.sql}`);
  }

  async all() {
    if (this.sql.startsWith('SELECT * FROM withdrawals WHERE user_id =')) {
      return { results: this.db.withdrawals.filter((row) => row.user_id === this.values[0]) };
    }
    if (this.sql.startsWith('SELECT w.*, p.email AS user_email')) {
      const [status] = this.values;
      const rows = this.db.withdrawals.filter((row) => row.type === 'roi' && (status === 'all' || row.status === status));
      return { results: rows.map((row) => ({
        ...row,
        user_email: this.db.profiles.get(row.user_id)?.email || null,
        user_name: this.db.profiles.get(row.user_id)?.full_name || null,
        investment_plan_name: this.db.investments.get(row.investment_id)?.plan_name || null,
        investment_amount: this.db.investments.get(row.investment_id)?.amount || null,
        investment_current_value: this.db.investments.get(row.investment_id)?.current_value || null,
        investment_status: this.db.investments.get(row.investment_id)?.status || null,
      })) };
    }
    throw new Error(`Unhandled all SQL: ${this.sql}`);
  }
}

const db = new FakeD1();
for (const [token, userId] of [['user-token', 'user-1'], ['admin-token', 'admin-1']]) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  db.sessions.set(Buffer.from(digest).toString('base64url'), { userId });
}
const env = { DB: db, ADMIN_EMAILS: 'admin@example.com' };
const request = (path, token, options = {}) => new Request(`http://localhost${path}`, {
  ...options,
  headers: { cookie: `apex_session=${token}`, ...(options.headers || {}) },
});
const post = (path, token, body) => request(path, token, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body),
});

const created = await handleRoiWithdrawalRequest(post('/api/withdrawal-request', 'user-token', {
  type: 'roi', investment_id: 55, amount: 30,
}), env);
assert.equal(created.status, 201);
const firstWithdrawal = await created.json();
assert.equal(db.profiles.get('user-1').locked_balance, 20);
assert.equal(db.investments.get(55).roi_withdrawal_pending, 1);

const approved = await handleRoiWithdrawalRequest(post('/api/admin/roi-approvals', 'admin-token', {
  id: firstWithdrawal.id, action: 'approve', admin_notes: 'Reviewed',
}), env);
assert.equal(approved.status, 200);
assert.equal((await approved.json()).status, 'approved');
assert.equal(db.wallet.available, 50);
assert.equal(db.profiles.get('user-1').locked_balance, 20);
assert.equal(db.investments.get(55).roi_withdrawal_pending, 0);
assert.equal(db.ledger.filter((entry) => entry.source_type === 'roi_withdrawal').length, 1);

const rejectedRequest = await handleRoiWithdrawalRequest(post('/api/withdrawal-request', 'user-token', {
  type: 'roi', investment_id: 55, amount: 10,
}), env);
assert.equal(rejectedRequest.status, 201);
const secondWithdrawal = await rejectedRequest.json();
const rejected = await handleRoiWithdrawalRequest(post('/api/admin/roi-approvals', 'admin-token', {
  id: secondWithdrawal.id, action: 'reject', admin_notes: 'Hold retained',
}), env);
assert.equal(rejected.status, 200);
assert.equal((await rejected.json()).status, 'rejected');
assert.equal(db.profiles.get('user-1').locked_balance, 20);
assert.equal(db.wallet.available, 50);

const duplicateReview = await handleRoiWithdrawalRequest(post('/api/admin/roi-approvals', 'admin-token', {
  id: secondWithdrawal.id, action: 'reject',
}), env);
assert.equal(duplicateReview.status, 409);
assert.equal(db.profiles.get('user-1').locked_balance, 20);

console.log('ROI_WITHDRAWAL_API_TESTS_PASSED');
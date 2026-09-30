import assert from 'node:assert/strict';
import { handleKycRequest } from '../../worker/kyc-api.js';

const sessionId = async (token) => {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  return Buffer.from(digest).toString('base64url');
};

class FakeD1 {
  constructor() {
    this.users = new Map([
      ['user-1', { id: 'user-1', email: 'user1@example.com', created_at: '2026-01-01' }],
      ['user-2', { id: 'user-2', email: 'user2@example.com', created_at: '2026-01-01' }],
      ['admin-1', { id: 'admin-1', email: 'admin@example.com', created_at: '2026-01-01' }],
    ]);
    this.sessions = new Map();
    this.profiles = new Map([
      ['user-1', { user_id: 'user-1', role: 'user', kyc_status: 'unverified' }],
      ['user-2', { user_id: 'user-2', role: 'user', kyc_status: 'unverified' }],
      ['admin-1', { user_id: 'admin-1', role: 'admin', kyc_status: 'verified' }],
    ]);
    this.files = [];
    this.submissions = [];
    this.notifications = [];
    this.audit = [];
    this.nextFileId = 1;
    this.nextSubmissionId = 1;
  }

  prepare(sql) {
    return new FakeStatement(this, sql);
  }

  async batch(statements) {
    const results = [];
    for (const statement of statements) {
      const { sql, values } = statement;
      if (sql.startsWith('INSERT INTO kyc_submissions')) {
        const [userId, personalData, documents, metadata] = values;
        const row = {
          id: this.nextSubmissionId++, user_id: userId, personal_data: personalData,
          documents, metadata, status: 'pending', reviewer_id: null, reviewed_at: null,
          admin_notes: null, submitted_at: new Date().toISOString(),
        };
        this.submissions.push(row);
        results.push({ results: [row] });
      } else if (sql.startsWith("UPDATE profiles SET kyc_status = 'pending'")) {
        const [userId] = values;
        const profile = this.profiles.get(userId);
        const changes = profile && this.submissions.some((row) => row.user_id === userId && row.status === 'pending');
        if (changes) profile.kyc_status = 'pending';
        results.push({ meta: { changes: Number(Boolean(changes)) } });
      } else if (sql.startsWith('INSERT INTO notifications')) {
        if (sql.includes("SELECT ?, 'KYC application submitted'")) {
          this.notifications.push({ user_id: values[0], title: 'KYC application submitted' });
        } else {
          const [title, body, id, status, reviewerId] = values;
          const submission = this.submissions.find((row) => row.id === id && row.status === status && row.reviewer_id === reviewerId);
          if (submission) this.notifications.push({ user_id: submission.user_id, title, body });
        }
        results.push({ meta: { changes: 1 } });
      } else if (sql.startsWith('UPDATE kyc_submissions')) {
        const [status, reviewerId, notes, id] = values;
        const submission = this.submissions.find((row) => row.id === id && row.status === 'pending');
        if (submission) Object.assign(submission, {
          status, reviewer_id: reviewerId, reviewed_at: new Date().toISOString(), admin_notes: notes,
        });
        results.push({ results: submission ? [submission] : [] });
      } else if (sql.startsWith('UPDATE profiles SET kyc_status = ?')) {
        const [status, id, submissionStatus, reviewerId] = values;
        const submission = this.submissions.find((row) => row.id === id && row.status === submissionStatus && row.reviewer_id === reviewerId);
        if (submission) this.profiles.get(submission.user_id).kyc_status = status;
        results.push({ meta: { changes: Number(Boolean(submission)) } });
      } else if (sql.startsWith('INSERT INTO admin_audit_logs')) {
        this.audit.push(values);
        results.push({ meta: { changes: 1 } });
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
    if (this.sql.startsWith('INSERT INTO kyc_files')) {
      const [userId, kind, mime, size, filename, objectKey] = this.values;
      const row = {
        id: this.db.nextFileId++, user_id: userId, kind, mime, size, filename,
        r2_object_key: objectKey, created_at: new Date().toISOString(),
      };
      this.db.files.push(row);
      return row;
    }
    if (this.sql.startsWith('SELECT id, user_id, kind, mime, filename, r2_object_key FROM kyc_files')) {
      const file = this.db.files.find((row) => row.id === this.values[0]);
      return file || null;
    }
    if (this.sql.startsWith('SELECT id FROM kyc_submissions')) {
      const submission = this.db.submissions.find((row) => row.user_id === this.values[0] && row.status === 'pending');
      return submission ? { id: submission.id } : null;
    }
    throw new Error(`Unhandled first SQL: ${this.sql}`);
  }

  async all() {
    if (this.sql.startsWith('SELECT id, user_id, kind FROM kyc_files')) {
      const [userId, ...ids] = this.values;
      return { results: this.db.files.filter((file) => file.user_id === userId && ids.includes(file.id)) };
    }
    if (this.sql.startsWith('SELECT s.*, p.email AS user_email')) {
      const [status, , limit, offset] = this.values;
      return {
        results: this.db.submissions.filter((row) => status === 'all' || row.status === status)
          .slice(offset, offset + limit).map((row) => ({
            ...row,
            user_email: this.db.users.get(row.user_id)?.email || null,
            user_name: row.user_id,
          })),
      };
    }
    if (this.sql.startsWith('SELECT * FROM kyc_submissions WHERE user_id =')) {
      return { results: this.db.submissions.filter((row) => row.user_id === this.values[0]) };
    }
    throw new Error(`Unhandled all SQL: ${this.sql}`);
  }
}

const db = new FakeD1();
for (const [token, userId] of [['user-one', 'user-1'], ['user-two', 'user-2'], ['admin-token', 'admin-1'], ['stranger-token', 'user-2']]) {
  db.sessions.set(await sessionId(token), { userId });
}

const objects = new Map();
const bucket = {
  async put(key, bytes, options) { objects.set(key, { bytes: Uint8Array.from(bytes), options }); },
  async get(key) {
    const stored = objects.get(key);
    return stored ? {
      body: new Response(stored.bytes).body,
      httpMetadata: { contentType: stored.options.httpMetadata.contentType },
    } : null;
  },
  async delete(key) { objects.delete(key); },
};
const env = { DB: db, KYC_FILES: bucket, ADMIN_EMAILS: 'admin@example.com' };
const request = (path, token, options = {}) => new Request(`http://localhost${path}`, {
  ...options,
  headers: { cookie: `apex_session=${token}`, ...(options.headers || {}) },
});
const bodyRequest = (path, token, body) => request(path, token, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify(body),
});

const imageData = `data:image/png;base64,${Buffer.from('private-identity-image').toString('base64')}`;
const upload = await handleKycRequest(bodyRequest('/api/kyc-upload', 'user-one', {
  kind: 'document_front', data_url: imageData, filename: 'front.png',
}), env);
assert.equal(upload.status, 201);
const fileId = (await upload.json()).file.id;
assert.equal(objects.size, 1);

const ownerRead = await handleKycRequest(request(`/api/kyc-upload?id=${fileId}`, 'user-one'), env);
assert.equal(ownerRead.status, 200);
assert.equal(await ownerRead.text(), 'private-identity-image');

const forbiddenRead = await handleKycRequest(request(`/api/kyc-upload?id=${fileId}`, 'user-two'), env);
assert.equal(forbiddenRead.status, 403);
const adminRead = await handleKycRequest(request(`/api/kyc-upload?id=${fileId}`, 'admin-token'), env);
assert.equal(adminRead.status, 200);

const application = {
  personal_data: {
    first_name: 'Alex', last_name: 'Taylor', dob: '1990-02-03', nationality: 'US', country: 'US',
    address: { street: '1 Main Street', city: 'Boston', country: 'US' },
    document: { type: 'passport', number: 'P12345', expiry_date: '2030-01-01' },
  },
  documents: [{ kind: 'document_front', file_id: fileId, name: 'front.png' }],
  metadata: {},
};
const submitted = await handleKycRequest(bodyRequest('/api/user/kyc', 'user-one', application), env);
assert.equal(submitted.status, 201);
const submissionId = (await submitted.json()).submission.id;
assert.equal(db.profiles.get('user-1').kyc_status, 'pending');

const approved = await handleKycRequest(bodyRequest('/api/admin/kyc', 'admin-token', {
  id: submissionId, action: 'approve', admin_notes: 'Verified',
}), env);
assert.equal(approved.status, 200);
assert.equal((await approved.json()).submission.status, 'approved');
assert.equal(db.profiles.get('user-1').kyc_status, 'verified');
assert.equal(db.audit.length, 1);

const secondUpload = await handleKycRequest(bodyRequest('/api/kyc-upload', 'user-two', {
  kind: 'document_front', data_url: imageData, filename: 'front.png',
}), env);
assert.equal(secondUpload.status, 201);
const secondFileId = (await secondUpload.json()).file.id;
const secondSubmission = await handleKycRequest(bodyRequest('/api/user/kyc', 'user-two', {
  ...application,
  documents: [{ kind: 'document_front', file_id: secondFileId, name: 'front.png' }],
}), env);
assert.equal(secondSubmission.status, 201);
const secondSubmissionId = (await secondSubmission.json()).submission.id;
const rejected = await handleKycRequest(bodyRequest('/api/admin/kyc', 'admin-token', {
  id: secondSubmissionId, action: 'reject', admin_notes: 'Image is unclear',
}), env);
assert.equal(rejected.status, 200);
assert.equal((await rejected.json()).submission.status, 'rejected');
assert.equal(db.profiles.get('user-2').kyc_status, 'rejected');
assert.equal(db.audit.length, 2);

console.log('KYC_API_TESTS_PASSED');
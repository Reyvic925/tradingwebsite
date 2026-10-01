import assert from 'node:assert/strict';
import { notifyUser } from '../../worker/notifications.js';
import { sendEmail, sendUserEmail } from '../../worker/email.js';

const originalFetch = globalThis.fetch;
const calls = [];
globalThis.fetch = async (url, options) => {
  calls.push({ url, options });
  return new Response(JSON.stringify({ id: 'email_test_id' }), { status: 200 });
};

assert.equal(await sendEmail({}, { to: 'user@example.com', subject: 'Hello', text: 'Test' }), false);
assert.equal(calls.length, 0);

const env = {
  RESEND_API_KEY: 'test-key',
  RESEND_FROM_EMAIL: 'The Prime Markets <alerts@example.com>',
  DB: { prepare: () => ({ bind: () => ({ first: async () => ({ email: 'client@example.com' }) }) }) },
};
assert.equal(await sendUserEmail(env, 'user-1', { subject: 'KYC update', text: 'Review complete.' }, 'test'), true);
assert.equal(calls.length, 1);
assert.equal(calls[0].url, 'https://api.resend.com/emails');
const workerEmail = JSON.parse(calls[0].options.body);
assert.deepEqual({ ...workerEmail, html: undefined }, {
  from: 'The Prime Markets <alerts@example.com>',
  to: ['client@example.com'],
  subject: 'KYC update',
  text: 'Review complete.',
  html: undefined,
});
assert.match(workerEmail.html, /max-width:580px/);
assert.match(workerEmail.html, /background-color:#f2efe9/);
assert.match(workerEmail.html, /Review complete\./);
assert.match(workerEmail.html, /The Prime Markets/);

const savedNotifications = [];
const notificationEnv = {
  ...env,
  DB: {
    prepare: () => ({
      bind: (...values) => ({
        first: async () => ({ email: 'client@example.com' }),
        run: async () => { savedNotifications.push(values); return { success: true }; },
      }),
    }),
  },
};
assert.equal(await notifyUser(notificationEnv, 'user-1', 'Deposit confirmed', 'Funds were credited.', 'test'), true);
assert.deepEqual(savedNotifications[0], ['user-1', 'Deposit confirmed', 'Funds were credited.']);
assert.equal(JSON.parse(calls[1].options.body).subject, 'Deposit confirmed');

globalThis.fetch = async () => new Response('sender domain is not verified', { status: 403 });
assert.equal(await sendEmail(env, { to: 'client@example.com', subject: 'Test', text: 'Test' }, 'test'), false);

globalThis.fetch = originalFetch;
console.log('WORKER_EMAIL_TESTS_PASSED');
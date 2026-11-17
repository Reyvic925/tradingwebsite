import assert from 'node:assert/strict';
import { notifyUser } from '../../worker/notifications.js';
import { sendEmail, sendUserEmail } from '../../worker/email.js';
import { renderPrimeMarketsEmail, renderPrimeMarketsText } from '../../shared/email-template.js';

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
  text: renderPrimeMarketsText({ title: 'KYC update', body: 'Review complete.', actionUrl: 'https://www.theprimemarkets.com/app' }),
  html: undefined,
});
assert.match(workerEmail.html, /max-width:580px/);
assert.match(workerEmail.html, /background-color:#f2efe9/);
assert.match(workerEmail.html, /Review complete\./);
assert.match(workerEmail.html, /The Prime Markets/);
assert.match(workerEmail.html, /support@theprimemarkets.com/);
assert.match(workerEmail.html, /If the button does not work/);
assert.doesNotMatch(workerEmail.html, /safely ignore this email/);
assert.match(workerEmail.text, /Kind regards,/);
assert.match(workerEmail.text, /Never share your password or verification code/);
const unsafeAction = renderPrimeMarketsEmail({ title: 'Account update', body: 'Review your account.', actionUrl: 'javascript:alert(1)' });
assert.doesNotMatch(unsafeAction, /javascript:/);
assert.doesNotMatch(renderPrimeMarketsText({ title: 'Account update', actionUrl: 'javascript:alert(1)' }), /javascript:/);

const escapedEmail = renderPrimeMarketsEmail({
  title: '<img src=x>',
  body: '<script>alert(1)</script>',
  actionUrl: 'https://example.com/?value=<script>',
  actionLabel: 'Open <account>',
});
assert.match(escapedEmail, /&lt;img src=x&gt;/);
assert.match(escapedEmail, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
assert.match(escapedEmail, /value=&lt;script&gt;/);
assert.doesNotMatch(escapedEmail, /<script>|<img src=x>/);

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
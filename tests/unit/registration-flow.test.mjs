import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const source = fs.readFileSync('src/pages/Login.tsx', 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS },
}).outputText;
const storage = new Map();
let hooks = [];
let cursor = 0;
let search = '?mode=signup';
let calls = [];
let signupHandler = async () => ({ email_sent: true });
let loginHandler = async () => ({});
const jsx = (type, props) => ({ type, props });
const react = {
  useState(initial) {
    const index = cursor++;
    if (!(index in hooks)) hooks[index] = typeof initial === 'function' ? initial() : initial;
    return [hooks[index], (value) => { hooks[index] = typeof value === 'function' ? value(hooks[index]) : value; }];
  },
  useRef(initial) {
    const index = cursor++;
    if (!(index in hooks)) hooks[index] = { current: initial };
    return hooks[index];
  },
  useEffect() {},
};
const auth = {
  signUp: async (...args) => { calls.push(['signup', ...args]); return signupHandler(...args); },
  signIn: async (...args) => { calls.push(['login', ...args]); return loginHandler(...args); },
  verifyEmailCode: async (...args) => { calls.push(['verify', ...args]); return { ok: true }; },
  resendVerificationEmail: async (...args) => { calls.push(['resend', ...args]); return { ok: true }; },
};
const exports = {};
vm.runInNewContext(compiled, {
  exports,
  require(name) {
    if (name === 'react') return react;
    if (name === 'react/jsx-runtime') return { jsx, jsxs: jsx };
    if (name === 'react-router-dom') return {
      Navigate: 'navigate',
      useNavigate: () => (url) => { search = url.includes('?') ? url.slice(url.indexOf('?')) : ''; },
      useSearchParams: () => [new URLSearchParams(search)],
    };
    if (name.includes('AuthContext')) return { useAuth: () => ({ user: null, loading: false }) };
    if (name === '../lib/auth') return auth;
    if (name === '../lib/api') return {
      apiSend: async (...args) => { calls.push(['api', ...args]); },
      takeReferral: () => 'REF123', clearReferral: () => {},
    };
    if (name.includes('Logo')) return { default: 'logo' };
    return new Proxy({}, { get: (_, key) => key });
  },
  localStorage: {
    getItem: (key) => storage.get(key) || null,
    setItem: (key, value) => storage.set(key, value),
    removeItem: (key) => storage.delete(key),
  },
  window: { location: {}, setInterval, clearInterval },
  URLSearchParams, Date, Error, console,
});
function render() { cursor = 0; return exports.default(); }
function nodes(node) {
  if (!node || typeof node !== 'object') return [];
  if (Array.isArray(node)) return node.flatMap(nodes);
  return [node, ...nodes(node.props?.children)];
}
function field(name) { return nodes(render()).find((node) => node.type === 'input' && (node.props.name === name || node.props.autoComplete === name)); }
function enter(name, value) { field(name).props.onChange({ target: { value } }); }
async function submit() { return nodes(render()).find((node) => node.type === 'form').props.onSubmit({ preventDefault() {} }); }
function reset(query = '?mode=signup') { hooks = []; search = query; calls = []; }

reset();
assert.equal(nodes(render()).filter((node) => node.type === 'input').length, 3);
enter('email', 'invalid');
enter('name', 'Trader');
enter('password', 'short');
await submit();
assert.equal(calls.length, 0, 'Invalid fields must block registration');
enter('email', 'trader@example.com');
enter('password', 'correct horse battery staple');
let completeSignup;
signupHandler = () => new Promise((resolve) => { completeSignup = resolve; });
const firstSubmission = submit();
await submit();
assert.equal(calls.length, 1, 'Repeated submit events must create one request');
assert.deepEqual(Object.keys(calls[0][3]), ['full_name', 'referred_by']);
completeSignup({ email_sent: true });
await firstSubmission;
const saved = storage.get('apex-pending-verification');
assert.ok(saved.includes('trader@example.com'));
assert.ok(!saved.includes('correct horse'), 'Passwords must never be persisted');
assert.equal(field('password'), undefined);
assert.ok(nodes(render()).some((node) => node.type === 'button' && node.props.disabled && String(node.props.children).includes('Resend available')));

reset(); // Simulate a refreshed page with an empty password and full name.
assert.ok(field('one-time-code'), 'Refresh must restore code verification');
enter('one-time-code', '12 34-56 78');
await submit();
assert.deepEqual(calls[0], ['verify', 'trader@example.com', '12345678']);
assert.equal(storage.size, 0);
assert.equal(search, '?email=trader%40example.com');
assert.equal(field('email').props.value, 'trader@example.com');
assert.equal(field('password').props.value, '');

reset();
signupHandler = async () => { throw new Error('Failed to fetch'); };
enter('email', 'retry@example.com');
enter('name', 'Retry Trader');
enter('password', 'correct horse battery staple');
await submit();
assert.equal(field('password').props.value, 'correct horse battery staple', 'Failures must preserve input');
signupHandler = async () => ({ email_sent: false });
await submit();
assert.equal(calls.length, 2, 'Failed requests must release the submission guard');
assert.ok(field('one-time-code'));

reset('?mode=reset&token=reset-token');
enter('password', 'new password');
const confirmation = nodes(render()).find((node) => node.type === 'input' && node.props.placeholder === 'Confirm Password');
confirmation.props.onChange({ target: { value: 'different password' } });
await submit();
assert.equal(calls.length, 0, 'Reset must still enforce matching passwords');
confirmation.props.onChange({ target: { value: 'new password' } });
await submit();
assert.equal(calls[0][1], '/api/auth/password-reset/confirm');

storage.clear();
reset();
loginHandler = async () => { throw new Error('Confirm your email before signing in. Check your inbox for the verification code or link.'); };
search = '';
enter('email', 'pending@example.com');
enter('password', 'correct horse battery staple');
await submit();
assert.equal(search, '?mode=signup');
assert.ok(field('one-time-code'));
const resend = nodes(render()).find((node) => node.type === 'button' && node.props.children === 'Resend verification email');
assert.equal(resend.props.disabled, false, 'Returning users can request a code immediately');
await resend.props.onClick();
assert.deepEqual(calls.at(-1), ['resend', 'pending@example.com']);
storage.clear();
reset();
loginHandler = async () => ({});
signupHandler = async () => ({ email_sent: true });
enter('email', 'same-visit@example.com');
enter('name', 'Same Visit');
enter('password', 'correct horse battery staple');
await submit();
enter('one-time-code', '12345678');
await submit();
assert.deepEqual(calls.at(-1), ['login', 'same-visit@example.com', 'correct horse battery staple'], 'Same-visit verification should preserve automatic sign-in');
assert.equal(storage.size, 0);
console.log('REGISTRATION_FLOW_TESTS_PASSED');

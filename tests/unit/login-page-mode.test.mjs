import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const file = path.join(process.cwd(), 'src/pages/Login.tsx');
const source = fs.readFileSync(file, 'utf8');
const brandSource = fs.readFileSync(path.join(process.cwd(), 'src/lib/brand.ts'), 'utf8');

assert.match(source, /useSearchParams\s*\(\)/, 'Login page should read the URL mode parameter');
assert.match(source, /mode\s*===\s*['\"]signup['\"]|mode\s*===\s*['\"]login['\"]/, 'Login page should support both sign-in and sign-up modes');
assert.match(source, /Create account|Sign up|Create your account/i, 'Login page should render a signup action in signup mode');
for (const label of ['Email address', 'Full name', 'Password']) {
	assert.ok(source.includes(label), `Signup form should include ${label}`);
}
assert.match(source, /password\s*!==\s*confirmPassword/, 'Password reset should require matching passwords');
assert.match(source, /signUp\(email, password,\s*\{[\s\S]*full_name:/, 'Signup should persist the full name');
assert.match(source, /verificationPending/, 'Signup should wait for email confirmation before authenticating');
assert.match(source, /verifyEmailCode\(verificationEmail, verificationCode\)/, 'Signup should accept the emailed verification code');
assert.match(source, /resendVerificationEmail\(verificationEmail\)/, 'Signup should allow resending the verification email');
assert.match(source, /window\.location\.href\s*=\s*['"]\/app['"]/, 'Successful sign-in should use a full-page navigation to the app');
assert.doesNotMatch(source, /apiGet|\/api\/profile/, 'Login should not fetch the profile immediately after authentication');
assert.doesNotMatch(source, /Demo:/, 'Login must not advertise credentials that are not provisioned in production');
assert.doesNotMatch(brandSource, /demoEmail|demoPassword/, 'Brand config must not contain public demo credentials');

console.log('LOGIN_PAGE_MODE_TESTS_PASSED');

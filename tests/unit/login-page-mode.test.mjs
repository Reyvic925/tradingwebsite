import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const file = path.join(process.cwd(), 'src/pages/Login.tsx');
const source = fs.readFileSync(file, 'utf8');

assert.match(source, /useSearchParams\s*\(\)/, 'Login page should read the URL mode parameter');
assert.match(source, /mode\s*===\s*['\"]signup['\"]|mode\s*===\s*['\"]login['\"]/, 'Login page should support both sign-in and sign-up modes');
assert.match(source, /Create account|Sign up|Create your account/i, 'Login page should render a signup action in signup mode');
for (const label of ['Email Address', 'Full Name', 'Comms (Phone)', 'Location', 'Secure Password', 'Confirm Password']) {
	assert.ok(source.includes(label), `Signup form should include ${label}`);
}
assert.match(source, /password\s*!==\s*confirmPassword/, 'Signup should require matching passwords');
assert.match(source, /bootstrapProfile\(\s*\{[\s\S]*full_name:[\s\S]*phone:[\s\S]*country:/, 'Signup should persist contact details to the profile');

console.log('LOGIN_PAGE_MODE_TESTS_PASSED');

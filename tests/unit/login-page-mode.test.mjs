import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const file = path.join(process.cwd(), 'src/pages/Login.tsx');
const source = fs.readFileSync(file, 'utf8');

assert.match(source, /useSearchParams\s*\(\)/, 'Login page should read the URL mode parameter');
assert.match(source, /mode\s*===\s*['\"]signup['\"]|mode\s*===\s*['\"]login['\"]/, 'Login page should support both sign-in and sign-up modes');
assert.match(source, /Create account|Sign up|Create your account/i, 'Login page should render a signup action in signup mode');

console.log('LOGIN_PAGE_MODE_TESTS_PASSED');

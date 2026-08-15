import assert from 'node:assert/strict';
import { buildUserDirectoryEntry } from '../../api-handlers/admin-user-utils.js';

const entry = buildUserDirectoryEntry(
  {
    user_id: 'u-123',
    email: 'alice@example.com',
    full_name: 'Alice Example',
    role: 'user',
    kyc_status: 'pending',
    created_at: '2026-08-15T00:00:00Z',
  },
  {
    walletCount: 2,
    kycCount: 3,
    hasMnemonic: true,
    latestKyc: {
      id: 9,
      status: 'approved',
      submitted_at: '2026-08-14T00:00:00Z',
    },
  }
);

assert.equal(entry.user_id, 'u-123');
assert.equal(entry.email, 'alice@example.com');
assert.equal(entry.wallet_count, 2);
assert.equal(entry.kyc_status, 'approved');
assert.equal(entry.has_mnemonic, true);
assert.equal(entry.latest_kyc_submission_id, 9);

console.log('ADMIN_USERS_UTIL_TESTS_PASSED');

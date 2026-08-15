import assert from 'node:assert/strict';
import devDb from '../../api-handlers/dev-db.js';

const kycFiles = devDb.from('kyc_files');
const inserted = await kycFiles.insert({ user_id: 'u-1', kind: 'document_front', mime: 'image/png', filename: 'front.png', data_base64: 'abc' }).select('id, kind');
assert.equal(inserted.error, null);
assert.equal(inserted.data.length, 1);
assert.equal(inserted.data[0].kind, 'document_front');

const profiles = devDb.from('profiles');
await profiles.insert({ id: 1, user_id: 'u-1', kyc_status: 'pending' }).select();
const updated = await profiles.update({ kyc_status: 'verified' }).eq('user_id', 'u-1').select();
assert.equal(updated.error, null);
assert.equal(updated.data.length, 1);
assert.equal(updated.data[0].kyc_status, 'verified');

console.log('DEV_DB_OPS_TESTS_PASSED');

import assert from 'node:assert/strict';
import { handleDepositRequest } from '../../worker/deposit-api.js';

const env = {
  DB: {
    prepare() {
      assert.fail('D1 should not be accessed while deposit creation is disabled.');
    },
  },
};
const response = await handleDepositRequest(new Request('https://example.com/api/deposits', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ amount: 25, currency: 'USDC', tx_hash: 'test-transaction-12345' }),
}), env);

assert.equal(response.status, 503);
assert.deepEqual(await response.json(), { error: 'New deposit requests are temporarily paused.' });
console.log('WORKER_DEPOSIT_API_TESTS_PASSED');
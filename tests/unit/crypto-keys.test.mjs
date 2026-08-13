import assert from 'assert';
import cryptoKeys from '../../api-handlers/crypto-keys.js';

// Basic server-side unit tests for key generation + encryption/decryption
(async () => {
  // set a deterministic master key for tests
  process.env.ENCRYPTION_MASTER_KEY = 'test-master-key-please-change-in-prod';

  // EVM
  const evm = await cryptoKeys.generateEvmKeypair();
  assert.ok(evm.address && evm.privateKey, 'EVM generation should return address and privateKey');

  const encryptedPk = cryptoKeys.encryptString(evm.privateKey);
  assert.ok(encryptedPk.includes(':'), 'Encrypted payload has expected format');
  const decrypted = cryptoKeys.decryptString(encryptedPk);
  assert.strictEqual(decrypted, evm.privateKey, 'Decrypted private key should match original');

  // BTC
  const btc = await cryptoKeys.generateBitcoinKeypair();
  assert.ok(btc.address && btc.privateKey, 'BTC generation should return address and privateKey');

  const encryptedBtc = cryptoKeys.encryptString(btc.privateKey);
  const decryptedBtc = cryptoKeys.decryptString(encryptedBtc);
  assert.strictEqual(decryptedBtc, btc.privateKey, 'Decrypted BTC private key should match original');

  console.log('ALL TESTS PASSED');
})();

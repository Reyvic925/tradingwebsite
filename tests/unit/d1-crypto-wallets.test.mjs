import assert from 'node:assert/strict';
import bip39 from 'bip39';
import cryptoKeys from '../../api-handlers/crypto-keys.js';
import { decryptWalletSecret, deriveWalletVariants, encryptWalletSecret } from '../../worker/crypto-wallets.js';

const masterKey = 'test-only-master-key-at-least-32-characters';
const env = { ENCRYPTION_MASTER_KEY: masterKey };
process.env.ENCRYPTION_MASTER_KEY = masterKey;

await assert.rejects(() => encryptWalletSecret('secret', {}), /ENCRYPTION_MASTER_KEY/);

const mnemonic = bip39.generateMnemonic(128);
const variants = await deriveWalletVariants(mnemonic, env);
assert.equal(variants.length, 8);
assert.deepEqual(variants.map((variant) => variant.variant), [
  'btc', 'eth', 'bnb', 'usdt_erc20', 'usdc_erc20', 'polygon', 'avalanche', 'base',
]);
assert.ok(variants.find((variant) => variant.variant === 'btc').address.startsWith('1'));
assert.ok(variants.find((variant) => variant.variant === 'eth').address.startsWith('0x'));
assert.equal(
  variants.find((variant) => variant.variant === 'eth').address,
  variants.find((variant) => variant.variant === 'usdt_erc20').address,
);
assert.equal(
  await decryptWalletSecret(variants[0].encrypted_mnemonic, env),
  mnemonic,
);
assert.ok(await decryptWalletSecret(variants[0].encrypted_private_key, env));

const legacyCiphertext = cryptoKeys.encryptString(mnemonic);
assert.equal(await decryptWalletSecret(legacyCiphertext, env), mnemonic);
const workerCiphertext = await encryptWalletSecret(mnemonic, env);
assert.equal(cryptoKeys.decryptString(workerCiphertext), mnemonic);
assert.notEqual(workerCiphertext, await encryptWalletSecret(mnemonic, env));

console.log('D1_CRYPTO_WALLETS_TESTS_PASSED');
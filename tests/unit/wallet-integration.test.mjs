import assert from 'assert';
import cryptoKeys from '../../api-handlers/crypto-keys.js';

/**
 * Integration test for wallet generation fixes
 * Tests:
 * 1. Supported networks generate proper keypairs
 * 2. Unsupported networks throw descriptive errors
 * 3. Race conditions are handled gracefully
 */

(async () => {
  // Set test encryption key
  process.env.ENCRYPTION_MASTER_KEY = 'test-master-key-please-change-in-prod';

  console.log('🧪 Running wallet generation integration tests...\n');

  // Test 1: Supported EVM networks
  console.log('Test 1: EVM network generation');
  const evmNetworks = ['ethereum', 'binance', 'polygon'];
  for (const network of evmNetworks) {
    const keypair = await cryptoKeys.generateKeypairForNetwork(network);
    assert.ok(keypair.address, `${network} should have address`);
    assert.ok(keypair.privateKey, `${network} should have privateKey`);
    assert.ok(keypair.address.startsWith('0x'), `${network} address should be EVM format`);
    console.log(`  ✅ ${network}: ${keypair.address.substring(0, 10)}...`);
  }

  // Test 2: Bitcoin network
  console.log('\nTest 2: Bitcoin network generation');
  const btc = await cryptoKeys.generateKeypairForNetwork('bitcoin');
  assert.ok(btc.address, 'Bitcoin should have address');
  assert.ok(btc.privateKey, 'Bitcoin should have privateKey');
  assert.ok(btc.mnemonic, 'Bitcoin should have mnemonic');
  console.log(`  ✅ bitcoin: ${btc.address}`);

  // Test 3: Unsupported networks should throw clear errors
  console.log('\nTest 3: Unsupported networks throw proper errors');
  const unsupportedNetworks = ['solana', 'ripple', 'cardano', 'dogecoin'];
  for (const network of unsupportedNetworks) {
    try {
      await cryptoKeys.generateKeypairForNetwork(network);
      assert.fail(`${network} should throw an error, not silently fall back to EVM`);
    } catch (err) {
      assert.ok(
        err.message.includes('not yet implemented') || err.message.includes('Unsupported'),
        `${network} error should be descriptive: ${err.message}`
      );
      console.log(`  ✅ ${network}: throws "${err.message.substring(0, 50)}..."`);
    }
  }

  // Test 4: Currency mapping to network
  console.log('\nTest 4: Currency to network mapping');
  const currencyTests = [
    { currency: 'ETH', expectedNetwork: 'ethereum' },
    { currency: 'BTC', expectedNetwork: 'bitcoin' },
    { currency: 'bnb', expectedNetwork: 'binance' },
    { currency: 'matic', expectedNetwork: 'polygon' },
  ];
  
  for (const test of currencyTests) {
    const network = cryptoKeys.getNetworkForCurrency(test.currency);
    assert.strictEqual(network, test.expectedNetwork, `${test.currency} should map to ${test.expectedNetwork}`);
    console.log(`  ✅ ${test.currency} → ${network}`);
  }

  // Test 5: Encryption/decryption still works
  console.log('\nTest 5: Encryption/decryption of sensitive data');
  const sensitiveData = 'test-private-key-12345';
  const encrypted = cryptoKeys.encryptString(sensitiveData);
  assert.ok(encrypted.includes(':'), 'Encrypted data should have IV:ciphertext format');
  const decrypted = cryptoKeys.decryptString(encrypted);
  assert.strictEqual(decrypted, sensitiveData, 'Decrypted data should match original');
  console.log(`  ✅ Encryption/decryption works: "${sensitiveData}" → "${encrypted.substring(0, 20)}..." → "${decrypted}"`);

  // Test 6: Currency validation
  console.log('\nTest 6: Currency validation');
  try {
    await cryptoKeys.generateAndEncryptForCurrency('INVALID_CURRENCY');
    assert.fail('Should throw error for invalid currency');
  } catch (err) {
    assert.ok(err.message.includes('Unsupported currency'), 'Should have clear error message');
    console.log(`  ✅ Invalid currency rejected: "${err.message.substring(0, 50)}..."`);
  }

  console.log('\n✨ All integration tests passed!\n');
})();

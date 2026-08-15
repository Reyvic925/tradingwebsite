import assert from 'assert';
import cryptoKeys from '../../api-handlers/crypto-keys.js';

// Unit tests for hierarchical deterministic wallet generation
(async () => {
  // set a deterministic master key for tests
  process.env.ENCRYPTION_MASTER_KEY = 'test-master-key-please-change-in-prod';

  // Test 1: Generate a user mnemonic
  const userMnemonic = cryptoKeys.generateUserMnemonic();
  assert.ok(userMnemonic && userMnemonic.split(' ').length === 12, 'User mnemonic should be 12 words');

  // Test 2: Derive different addresses from the same mnemonic
  const btcAddress = await cryptoKeys.deriveAddressFromMnemonic(userMnemonic, 'BTC', 0);
  const ethAddress = await cryptoKeys.deriveAddressFromMnemonic(userMnemonic, 'ETH', 0);
  const usdtAddress = await cryptoKeys.deriveAddressFromMnemonic(userMnemonic, 'USDT', 1);
  const usdcAddress = await cryptoKeys.deriveAddressFromMnemonic(userMnemonic, 'USDC', 2);

  assert.ok(btcAddress.address && btcAddress.address.startsWith('1'), 'BTC address should start with 1 (P2PKH)');
  assert.ok(ethAddress.address && ethAddress.address.startsWith('0x'), 'ETH address should start with 0x');
  assert.ok(usdtAddress.address && usdtAddress.address.startsWith('0x'), 'USDT address should start with 0x');
  assert.ok(usdcAddress.address && usdcAddress.address.startsWith('0x'), 'USDC address should start with 0x');

  // Test 3: All addresses should be derived from the same mnemonic
  assert.strictEqual(btcAddress.mnemonic, userMnemonic, 'BTC address should reference the user mnemonic');
  assert.strictEqual(ethAddress.mnemonic, userMnemonic, 'ETH address should reference the user mnemonic');
  assert.strictEqual(usdtAddress.mnemonic, userMnemonic, 'USDT address should reference the user mnemonic');

  // Test 4: EVM addresses should be the same for all EVM currencies (since they use the same coin type 60')
  // But USDT uses index 1 and USDC uses index 2, so they will have different addresses
  assert.notStrictEqual(usdtAddress.address, usdcAddress.address, 'USDT and USDC should have different addresses (different indices)');

  // Test 5: ETH at index 0 should be different from USDT at index 1
  assert.notStrictEqual(ethAddress.address, usdtAddress.address, 'ETH (index 0) and USDT (index 1) should have different addresses');

  // Test 6: Encrypt and decrypt the private keys
  const encryptedPrivateKey = cryptoKeys.encryptString(ethAddress.privateKey);
  const decryptedPrivateKey = cryptoKeys.decryptString(encryptedPrivateKey);
  assert.strictEqual(decryptedPrivateKey, ethAddress.privateKey, 'Decrypted private key should match original');

  // Test 7: Generate all wallet variants from the mnemonic
  const allVariants = await cryptoKeys.generateAllWalletVariantsFromMnemonic(userMnemonic);
  assert.ok('btc' in allVariants, 'Should have BTC variant');
  assert.ok('eth' in allVariants, 'Should have ETH variant');
  assert.ok('usdt_erc20' in allVariants, 'Should have USDT variant');
  assert.ok('usdc_erc20' in allVariants, 'Should have USDC variant');
  assert.ok(!('tron' in allVariants), 'Should not have unsupported TRON variant');

  // Test 8: All variants should have the same mnemonic
  Object.values(allVariants).forEach((variant) => {
    const decrypted = cryptoKeys.decryptString(variant.encryptedMnemonic);
    assert.strictEqual(decrypted, userMnemonic, `All variants should reference the same user mnemonic`);
  });

  // Test 9: USDT, USDC, and other ERC20 tokens should reuse ETH's address (same derivation index 0)
  assert.strictEqual(allVariants.usdt_erc20.address, allVariants.eth.address, 'USDT should reuse ETH address (ERC20 token)');
  assert.strictEqual(allVariants.usdc_erc20.address, allVariants.eth.address, 'USDC should reuse ETH address (ERC20 token)');
  assert.strictEqual(allVariants.usdt_erc20.encryptedPrivateKey, allVariants.eth.encryptedPrivateKey, 'USDT should reuse ETH private key');
  assert.strictEqual(allVariants.usdc_erc20.encryptedPrivateKey, allVariants.eth.encryptedPrivateKey, 'USDC should reuse ETH private key');
  
  // But they should have different networks in metadata
  assert.strictEqual(allVariants.usdt_erc20.network, 'ethereum', 'USDT should be on ethereum network');
  assert.strictEqual(allVariants.usdc_erc20.network, 'binance', 'USDC should be on binance network');

  // Test 10: Deterministic encryption for the same private key produces the same ciphertext
  const testKey = ethAddress.privateKey;
  const enc1 = cryptoKeys.encryptString(testKey);
  const enc2 = cryptoKeys.encryptString(testKey);
  assert.strictEqual(enc1, enc2, 'Encrypting the same private key should produce the same ciphertext (deterministic IV)');

  console.log('ALL TESTS PASSED');
})();

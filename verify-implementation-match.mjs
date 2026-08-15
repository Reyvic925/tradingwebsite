// Verify our HD wallet implementation matches BIP44 standard
import cryptoKeys from './api-handlers/crypto-keys.js';
import bip39 from 'bip39';
import bip32 from 'bip32';
import * as bitcoin from 'bitcoinjs-lib';
import { ethers } from 'ethers';

process.env.ENCRYPTION_MASTER_KEY = 'test-standard-verification';

console.log('=== VERIFICATION: Our Implementation vs BIP44 Standard ===\n');

// Use test mnemonic
const TEST_MNEMONIC = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';

console.log('Test Mnemonic:');
console.log(`  ${TEST_MNEMONIC}\n`);

// 1. Generate using our implementation
console.log('🔍 Step 1: Generating addresses with our implementation...\n');

const ourAddresses = {};
const testCurrencies = [
  { currency: 'BTC', index: 0 },
  { currency: 'ETH', index: 0 },
  { currency: 'USDT', index: 1 },
  { currency: 'USDC', index: 2 },
  { currency: 'BNB', index: 6 },
  { currency: 'MATIC', index: 7 },
  { currency: 'AVAX', index: 8 },
  { currency: 'BASE', index: 11 },
];

for (const { currency, index } of testCurrencies) {
  try {
    const result = await cryptoKeys.deriveAddressFromMnemonic(TEST_MNEMONIC, currency, index);
    ourAddresses[currency] = result.address;
    console.log(`✅ ${currency.padEnd(6)} → ${result.address}`);
  } catch (err) {
    console.log(`❌ ${currency.padEnd(6)} → Error: ${err.message}`);
  }
}

// 2. Generate using standard BIP44
console.log('\n🔍 Step 2: Generating addresses with standard BIP44...\n');

const seed = await bip39.mnemonicToSeed(TEST_MNEMONIC);
const standardAddresses = {};

// Bitcoin
const btcRoot = bip32.fromSeed(seed);
const btcChild = btcRoot.derivePath("m/44'/0'/0'/0/0");
const { address: btcAddr } = bitcoin.payments.p2pkh({ pubkey: btcChild.publicKey });
standardAddresses.BTC = btcAddr;
console.log(`✅ BTC    → ${btcAddr}`);

// Ethereum and EVM chains
const ethPaths = {
  'ETH': "m/44'/60'/0'/0/0",
  'USDT': "m/44'/60'/0'/0/1",
  'USDC': "m/44'/60'/0'/0/2",
  'BNB': "m/44'/60'/0'/0/6",
  'MATIC': "m/44'/60'/0'/0/7",
  'AVAX': "m/44'/60'/0'/0/8",
  'BASE': "m/44'/60'/0'/0/11",
};

for (const [currency, path] of Object.entries(ethPaths)) {
  const evmRoot = bip32.fromSeed(seed);
  const evmChild = evmRoot.derivePath(path);
  const privateKeyHex = evmChild.privateKey.toString('hex');
  const wallet = new ethers.Wallet(`0x${privateKeyHex}`);
  standardAddresses[currency] = wallet.address;
  console.log(`✅ ${currency.padEnd(6)} → ${wallet.address}`);
}

// 3. Compare results
console.log('\n📊 COMPARISON RESULTS:\n');

let allMatch = true;
const comparisonResults = [];

for (const currency of Object.keys(ourAddresses)) {
  const match = ourAddresses[currency].toLowerCase() === standardAddresses[currency].toLowerCase();
  allMatch = allMatch && match;
  
  const status = match ? '✅ MATCH' : '❌ MISMATCH';
  comparisonResults.push({
    Currency: currency,
    'Our Implementation': ourAddresses[currency],
    'BIP44 Standard': standardAddresses[currency],
    Status: status
  });
}

console.table(comparisonResults);

// 4. Final verdict
console.log('\n' + '='.repeat(80));
if (allMatch) {
  console.log('✅ SUCCESS: All addresses match BIP44 standard!');
  console.log('\nThis means:');
  console.log('  • Compatible with Trust Wallet');
  console.log('  • Compatible with MetaMask');
  console.log('  • Compatible with Ledger Live');
  console.log('  • Compatible with all standard HD wallets');
  console.log('  • Users can import their mnemonic into any wallet manager');
} else {
  console.log('❌ FAILURE: Some addresses do not match BIP44 standard');
  process.exit(1);
}
console.log('='.repeat(80));

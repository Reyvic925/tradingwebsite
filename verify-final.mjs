// Verify USDT and USDC now reuse ETH address (ERC20 tokens)
import cryptoKeys from './api-handlers/crypto-keys.js';

process.env.ENCRYPTION_MASTER_KEY = 'test-verification-key';

console.log('=== FINAL WALLET VERIFICATION ===\n');

// Generate a single user mnemonic
const userMnemonic = cryptoKeys.generateUserMnemonic();
console.log('📋 User Mnemonic (12 words):');
console.log(`   ${userMnemonic}\n`);

// Generate all wallet variants
const variants = await cryptoKeys.generateAllWalletVariantsFromMnemonic(userMnemonic);

console.log('📊 Wallet Addresses:\n');
console.table(
  Object.entries(variants).map(([variant, wallet]) => ({
    'Variant': variant,
    'Currency': wallet.currency,
    'Network': wallet.network,
    'Address': wallet.address,
  }))
);

// Verify ERC20 tokens reuse ETH address
console.log('\n✅ VERIFICATION RESULTS:\n');

const ethAddr = variants.eth.address;
const usdtAddr = variants.usdt_erc20.address;
const usdcAddr = variants.usdc_erc20.address;

if (ethAddr === usdtAddr && ethAddr === usdcAddr) {
  console.log('✅ CORRECT: USDT and USDC reuse ETH address');
  console.log(`   ETH  Address: ${ethAddr}`);
  console.log(`   USDT Address: ${usdtAddr} (same)`);
  console.log(`   USDC Address: ${usdcAddr} (same)`);
  console.log('\n📌 Why this is correct:');
  console.log('   • USDT and USDC are ERC20 tokens');
  console.log('   • They live on the Ethereum blockchain');
  console.log('   • One Ethereum address can receive both USDT and USDC');
  console.log('   • Different networks (ethereum vs binance) tracked in metadata');
  console.log('\n🔑 Same Private Key:');
  console.log(`   • All three share the same private key`);
  console.log(`   • Same mnemonic derivation: m/44'/60'/0'/0/0`);
  console.log('\n📊 Unique Addresses by Blockchain:');
  
  const blockchainAddrs = {};
  for (const [variant, wallet] of Object.entries(variants)) {
    if (!blockchainAddrs[wallet.network]) {
      blockchainAddrs[wallet.network] = new Set();
    }
    blockchainAddrs[wallet.network].add(wallet.address);
  }
  
  for (const [network, addresses] of Object.entries(blockchainAddrs)) {
    console.log(`   ${network.padEnd(12)}: ${addresses.size} unique address(es)`);
    if (addresses.size === 1) {
      console.log(`                 (${Array.from(addresses)[0].substring(0, 14)}...)`);
    }
  }
} else {
  console.log('❌ ERROR: USDT and USDC do not share ETH address');
  process.exit(1);
}

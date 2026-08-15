// Show how the new code correctly handles USDT and USDC
import cryptoKeys from './api-handlers/crypto-keys.js';

process.env.ENCRYPTION_MASTER_KEY = 'fresh-test-key';

console.log('=== DEMONSTRATING CORRECT USDT/USDC BEHAVIOR ===\n');

const mnemonic = cryptoKeys.generateUserMnemonic();
console.log('Test Mnemonic:', mnemonic, '\n');

// Derive addresses individually
console.log('Individual Derivations:\n');

const eth = await cryptoKeys.deriveAddressFromMnemonic(mnemonic, 'ETH', 0);
console.log('ETH (index 0):');
console.log(`  Address: ${eth.address}`);
console.log(`  Path: m/44'/60'/0'/0/0\n`);

const usdt = await cryptoKeys.deriveAddressFromMnemonic(mnemonic, 'USDT', 0);
console.log('USDT (index 0):');
console.log(`  Address: ${usdt.address}`);
console.log(`  Path: m/44'/60'/0'/0/0`);
console.log(`  SAME AS ETH: ${eth.address === usdt.address ? '✅ YES' : '❌ NO'}\n`);

const usdc = await cryptoKeys.deriveAddressFromMnemonic(mnemonic, 'USDC', 0);
console.log('USDC (index 0):');
console.log(`  Address: ${usdc.address}`);
console.log(`  Path: m/44'/60'/0'/0/0`);
console.log(`  SAME AS ETH: ${eth.address === usdc.address ? '✅ YES' : '❌ NO'}\n`);

// Now show the full wallet variants
console.log('Full Wallet Generation:\n');
const variants = await cryptoKeys.generateAllWalletVariantsFromMnemonic(mnemonic);

const summary = {
  ETH: variants.eth.address,
  USDT: variants.usdt_erc20.address,
  USDC: variants.usdc_erc20.address,
  BNB: variants.bnb.address,
  MATIC: variants.polygon.address,
};

for (const [currency, address] of Object.entries(summary)) {
  console.log(`${currency.padEnd(6)}: ${address}`);
}

console.log('\n✅ Verification:');
console.log(`ETH = USDT = USDC: ${summary.ETH === summary.USDT && summary.ETH === summary.USDC ? '✅ TRUE' : '❌ FALSE'}`);
console.log(`BNB (index 6): ${summary.BNB !== summary.ETH ? '✅ Different' : '❌ Same'}`);
console.log(`MATIC (index 7): ${summary.MATIC !== summary.ETH ? '✅ Different' : '❌ Same'}`);

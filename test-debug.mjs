import cryptoKeys from './api-handlers/crypto-keys.js';

process.env.ENCRYPTION_MASTER_KEY = 'test';

const mnemonic = cryptoKeys.generateUserMnemonic();
console.log('Mnemonic:', mnemonic.split(' ').length, 'words');
console.log('DEFAULT_WALLET_VARIANTS:', cryptoKeys.DEFAULT_WALLET_VARIANTS);

const variants = await cryptoKeys.generateAllWalletVariantsFromMnemonic(mnemonic);
console.log('Generated variants:', Object.keys(variants));

for (const [key, val] of Object.entries(variants)) {
  console.log(`  ${key}: ${val.currency} on ${val.network} = ${val.address.slice(0, 12)}...`);
}

import bip39 from 'bip39';
import * as bitcoin from 'bitcoinjs-lib';
import bip32 from 'bip32';
import { ethers } from 'ethers';

const encoder = new TextEncoder();
const decoder = new TextDecoder();

const WALLET_VARIANTS = [
  { variant: 'btc', currency: 'BTC', network: 'bitcoin', key: 'bitcoin' },
  { variant: 'eth', currency: 'ETH', network: 'ethereum', key: 'ethereum' },
  { variant: 'bnb', currency: 'BNB', network: 'binance', key: 'ethereum' },
  { variant: 'usdt_erc20', currency: 'USDT', network: 'ethereum', key: 'ethereum' },
  { variant: 'usdc_erc20', currency: 'USDC', network: 'binance', key: 'ethereum' },
  { variant: 'polygon', currency: 'MATIC', network: 'polygon', key: 'ethereum' },
  { variant: 'avalanche', currency: 'AVAX', network: 'avalanche', key: 'ethereum' },
  { variant: 'base', currency: 'BASE', network: 'base', key: 'ethereum' },
];

function bytesToHex(bytes) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function hexToBytes(hex) {
  if (!/^(?:[0-9a-f]{2})+$/i.test(hex)) throw new Error('Invalid encrypted wallet payload.');
  return Uint8Array.from(hex.match(/.{2}/g), (byte) => Number.parseInt(byte, 16));
}

async function getEncryptionKey(env) {
  const masterKey = String(env.ENCRYPTION_MASTER_KEY || '');
  if (masterKey.length < 32) throw new Error('ENCRYPTION_MASTER_KEY must be configured with at least 32 characters.');
  const rawKey = await crypto.subtle.digest('SHA-256', encoder.encode(masterKey));
  return crypto.subtle.importKey('raw', rawKey, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}

export async function encryptWalletSecret(value, env) {
  const key = await getEncryptionKey(env);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encryptedWithTag = new Uint8Array(await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, tagLength: 128 },
    key,
    encoder.encode(String(value)),
  ));
  const tagOffset = encryptedWithTag.length - 16;
  const ciphertext = encryptedWithTag.slice(0, tagOffset);
  const tag = encryptedWithTag.slice(tagOffset);
  return `${bytesToHex(iv)}:${bytesToHex(ciphertext)}:${bytesToHex(tag)}`;
}

export async function decryptWalletSecret(payload, env) {
  const parts = String(payload || '').split(':');
  if (parts.length !== 3) throw new Error('Invalid encrypted wallet payload.');
  const iv = hexToBytes(parts[0]);
  const ciphertext = hexToBytes(parts[1]);
  const tag = hexToBytes(parts[2]);
  if (iv.length !== 12 || tag.length !== 16) throw new Error('Invalid encrypted wallet payload.');
  const key = await getEncryptionKey(env);
  const encryptedWithTag = new Uint8Array(ciphertext.length + tag.length);
  encryptedWithTag.set(ciphertext);
  encryptedWithTag.set(tag, ciphertext.length);
  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv, tagLength: 128 },
    key,
    encryptedWithTag,
  );
  return decoder.decode(plaintext);
}

export async function deriveWalletVariants(mnemonic, env) {
  const seed = Buffer.from(await bip39.mnemonicToSeed(mnemonic));
  const root = bip32.fromSeed(seed);
  const bitcoinChild = root.derivePath("m/44'/0'/0'/0/0");
  const bitcoinAddress = bitcoin.payments.p2pkh({ pubkey: bitcoinChild.publicKey }).address;
  if (!bitcoinAddress || !bitcoinChild.privateKey) throw new Error('Bitcoin wallet derivation failed.');

  const evmChild = root.derivePath("m/44'/60'/0'/0/0");
  if (!evmChild.privateKey) throw new Error('EVM wallet derivation failed.');
  const evmPrivateKey = `0x${Buffer.from(evmChild.privateKey).toString('hex')}`;
  const evmWallet = new ethers.Wallet(evmPrivateKey);
  const keys = {
    bitcoin: bitcoinChild.toWIF(),
    ethereum: evmWallet.privateKey,
  };
  const addresses = {
    bitcoin: bitcoinAddress,
    ethereum: evmWallet.address,
  };
  const encryptedMnemonic = await encryptWalletSecret(mnemonic, env);
  const variants = [];

  for (const definition of WALLET_VARIANTS) {
    variants.push({
      variant: definition.variant,
      currency: definition.currency,
      network: definition.network,
      address: addresses[definition.key],
      encrypted_private_key: await encryptWalletSecret(keys[definition.key], env),
      encrypted_mnemonic: encryptedMnemonic,
      metadata_json: JSON.stringify({ wallet_variant: definition.variant, auto_generated_at_registration: true }),
    });
  }
  return variants;
}

export async function ensureUserCryptoWallets(db, userId, env) {
  const existingAddresses = await db.prepare(`
    SELECT id, currency, network, address, metadata_json
    FROM crypto_addresses
    WHERE user_id = ?
    ORDER BY id ASC
  `).bind(userId).all();
  if ((existingAddresses.results || []).length >= WALLET_VARIANTS.length) return existingAddresses.results;

  let mnemonicRecord = await db.prepare('SELECT encrypted_mnemonic FROM user_mnemonics WHERE user_id = ?')
    .bind(userId).first();

  if (!mnemonicRecord) {
    const mnemonic = bip39.generateMnemonic(128);
    const encryptedMnemonic = await encryptWalletSecret(mnemonic, env);
    await db.prepare(`
      INSERT OR IGNORE INTO user_mnemonics (user_id, encrypted_mnemonic)
      VALUES (?, ?)
    `).bind(userId, encryptedMnemonic).run();
    mnemonicRecord = await db.prepare('SELECT encrypted_mnemonic FROM user_mnemonics WHERE user_id = ?')
      .bind(userId).first();
  }
  if (!mnemonicRecord?.encrypted_mnemonic) throw new Error('Unable to store the account wallet mnemonic.');

  const mnemonic = await decryptWalletSecret(mnemonicRecord.encrypted_mnemonic, env);
  const variants = await deriveWalletVariants(mnemonic, env);
  for (const variant of variants) {
    await db.prepare(`
      INSERT OR IGNORE INTO crypto_addresses
        (user_id, currency, network, address, encrypted_private_key, encrypted_mnemonic, metadata_json)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).bind(
      userId,
      variant.currency,
      variant.network,
      variant.address,
      variant.encrypted_private_key,
      variant.encrypted_mnemonic,
      variant.metadata_json,
    ).run();
  }

  const result = await db.prepare(`
    SELECT id, currency, network, address, metadata_json
    FROM crypto_addresses
    WHERE user_id = ?
    ORDER BY id ASC
  `).bind(userId).all();
  return result.results || [];
}

export { WALLET_VARIANTS };
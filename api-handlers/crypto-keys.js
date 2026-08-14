import crypto from 'crypto';
import bip39 from 'bip39';
import * as bitcoin from 'bitcoinjs-lib';
import bip32 from 'bip32';
import { ethers } from 'ethers';

// AES-256-GCM helper using a key derived from ENCRYPTION_MASTER_KEY
function getMasterKey() {
  const master = process.env.ENCRYPTION_MASTER_KEY;
  if (!master) throw new Error('ENCRYPTION_MASTER_KEY is not set');
  // Derive a 32-byte key deterministically from the provided master secret
  return crypto.createHash('sha256').update(master, 'utf8').digest();
}

export function encryptString(plaintext) {
  const key = getMasterKey();
  const iv = crypto.randomBytes(12); // recommended IV size for GCM
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  // store as hex parts iv:ciphertext:tag
  return `${iv.toString('hex')}:${encrypted.toString('hex')}:${tag.toString('hex')}`;
}

export function decryptString(payload) {
  const key = getMasterKey();
  const parts = payload.split(':');
  if (parts.length !== 3) throw new Error('Invalid encrypted payload');
  const iv = Buffer.from(parts[0], 'hex');
  const encrypted = Buffer.from(parts[1], 'hex');
  const tag = Buffer.from(parts[2], 'hex');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  const out = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  return out.toString('utf8');
}

export async function generateEvmKeypair() {
  // ethers creates a random wallet with mnemonic and private key
  const wallet = ethers.Wallet.createRandom();
  return {
    address: wallet.address,
    privateKey: wallet.privateKey,
    mnemonic: wallet.mnemonic?.phrase || null,
  };
}

export async function generateBitcoinKeypair() {
  // BIP39 mnemonic + BIP32 derivation for first receiving address
  const mnemonic = bip39.generateMnemonic();
  const seed = await bip39.mnemonicToSeed(mnemonic);
  const root = bip32.fromSeed(seed);
  // Use BIP44 account 0, external chain 0, index 0: m/44'/0'/0'/0/0
  const child = root.derivePath("m/44'/0'/0'/0/0");
  const { address } = bitcoin.payments.p2pkh({ pubkey: child.publicKey });
  const privateKeyWIF = child.toWIF();
  return { address, privateKey: privateKeyWIF, mnemonic };
}

// Helper that generates keys for a currency and returns address + encrypted blobs
export async function generateAndEncryptForCurrency(currency) {
  const lower = (currency || '').trim().toLowerCase();
  const evmLike = new Set([
    'eth', 'ethereum', 'erc20', 'evm',
    'usdt', 'usdc', 'bnb', 'binance', 'matic', 'polygon',
    'sol', 'solana', 'xrp', 'ripple', 'ada', 'cardano',
    'doge', 'dogecoin', 'ltc', 'litecoin', 'trx', 'tron',
    'avax', 'arb', 'arbitrum', 'op', 'optimism', 'base',
  ]);
  const btcLike = new Set(['btc', 'bitcoin']);

  if (btcLike.has(lower)) {
    const { address, privateKey, mnemonic } = await generateBitcoinKeypair();
    return {
      address,
      encryptedPrivateKey: encryptString(privateKey),
      encryptedMnemonic: mnemonic ? encryptString(mnemonic) : null,
    };
  }

  if (evmLike.has(lower) || lower.startsWith('eth') || lower.startsWith('0x')) {
    const { address, privateKey, mnemonic } = await generateEvmKeypair();
    return {
      address,
      encryptedPrivateKey: encryptString(privateKey),
      encryptedMnemonic: mnemonic ? encryptString(mnemonic) : null,
    };
  }

  throw new Error(`Unsupported currency for on-server deposit generation: ${currency}. Supported: BTC, ETH, USDT, USDC, BNB, SOL, XRP, ADA, DOGE, MATIC`);
}

export default {
  encryptString,
  decryptString,
  generateEvmKeypair,
  generateBitcoinKeypair,
  generateAndEncryptForCurrency,
};

import crypto from 'crypto';
import bip39 from 'bip39';
import * as bitcoin from 'bitcoinjs-lib';
import bip32 from 'bip32';
import { ethers } from 'ethers';

export const CURRENCY_TO_NETWORK = {
  btc: 'bitcoin',
  bitcoin: 'bitcoin',
  eth: 'ethereum',
  ethereum: 'ethereum',
  usdt: 'ethereum',
  usdc: 'ethereum',
  dai: 'ethereum',
  link: 'ethereum',
  weth: 'ethereum',
  bnb: 'binance',
  binance: 'binance',
  busd: 'binance',
  sol: 'solana',
  solana: 'solana',
  xrp: 'ripple',
  ripple: 'ripple',
  ada: 'cardano',
  cardano: 'cardano',
  doge: 'dogecoin',
  dogecoin: 'dogecoin',
  matic: 'polygon',
  polygon: 'polygon',
  avax: 'avalanche',
  avalanche: 'avalanche',
  arb: 'arbitrum',
  arbitrum: 'arbitrum',
  op: 'optimism',
  optimism: 'optimism',
  base: 'base',
};

export const NETWORK_CANONICAL_CURRENCY = {
  bitcoin: 'BTC',
  ethereum: 'ETH',
  binance: 'BNB',
  solana: 'SOL',
  ripple: 'XRP',
  cardano: 'ADA',
  dogecoin: 'DOGE',
  polygon: 'MATIC',
  avalanche: 'AVAX',
  arbitrum: 'ARB',
  optimism: 'OP',
  base: 'BASE',
};

export function normalizeCurrency(currency) {
  return String(currency || '').trim().toLowerCase();
}

export function getNetworkForCurrency(currency) {
  const normalized = normalizeCurrency(currency);
  if (!normalized) return null;
  if (normalized.startsWith('0x')) return 'ethereum';
  return CURRENCY_TO_NETWORK[normalized] || null;
}

export function getCanonicalCurrencyForNetwork(network) {
  const n = String(network || '').trim().toLowerCase();
  return NETWORK_CANONICAL_CURRENCY[n] || n.toUpperCase();
}

// AES-256-GCM helper using a key derived from ENCRYPTION_MASTER_KEY
function getMasterKey() {
  const master = process.env.ENCRYPTION_MASTER_KEY;
  if (!master) throw new Error('ENCRYPTION_MASTER_KEY is not set');
  return crypto.createHash('sha256').update(master, 'utf8').digest();
}

export function encryptString(plaintext) {
  const key = getMasterKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
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
  const wallet = ethers.Wallet.createRandom();
  return {
    address: wallet.address,
    privateKey: wallet.privateKey,
    mnemonic: wallet.mnemonic?.phrase || null,
  };
}

export async function generateBitcoinKeypair() {
  const mnemonic = bip39.generateMnemonic();
  const seed = await bip39.mnemonicToSeed(mnemonic);
  const root = bip32.fromSeed(seed);
  const child = root.derivePath("m/44'/0'/0'/0/0");
  const { address } = bitcoin.payments.p2pkh({ pubkey: child.publicKey });
  const privateKeyWIF = child.toWIF();
  return { address, privateKey: privateKeyWIF, mnemonic };
}

export async function generateKeypairForNetwork(network) {
  const normalized = String(network || '').trim().toLowerCase();
  if (!normalized) throw new Error('Network is required');

  if (normalized === 'bitcoin') return generateBitcoinKeypair();
  if (['ethereum', 'binance', 'polygon', 'avalanche', 'arbitrum', 'optimism', 'base'].includes(normalized)) {
    return generateEvmKeypair();
  }

  // Fallback for non-EVM simulated chains: still generate a random wallet and keep the network label.
  return generateEvmKeypair();
}

export async function generateAndEncryptForCurrency(currency) {
  const network = getNetworkForCurrency(currency);
  if (!network) {
    throw new Error(`Unsupported currency for on-server deposit generation: ${currency}. Supported: BTC, ETH, USDT, USDC, BNB, SOL, XRP, ADA, DOGE, MATIC`);
  }
  const canonicalCurrency = getCanonicalCurrencyForNetwork(network);
  const { address, privateKey, mnemonic } = await generateKeypairForNetwork(network);
  return {
    address,
    network,
    currency: canonicalCurrency,
    encryptedPrivateKey: encryptString(privateKey),
    encryptedMnemonic: mnemonic ? encryptString(mnemonic) : null,
  };
}

export default {
  encryptString,
  decryptString,
  generateEvmKeypair,
  generateBitcoinKeypair,
  generateKeypairForNetwork,
  generateAndEncryptForCurrency,
  getNetworkForCurrency,
  getCanonicalCurrencyForNetwork,
};

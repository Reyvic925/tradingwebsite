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
  usdc: 'binance',
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

// Wallet variants map: stores which currencies share the same keypair
// EVM-compatible chains reuse the same address/private key
export const WALLET_VARIANTS = {
  btc: { network: 'bitcoin', type: 'primary' },
  eth: { network: 'ethereum', type: 'primary' },
  bnb: { network: 'binance', type: 'primary', reusesNetworkKey: 'ethereum' },
  tron: { network: 'tron', type: 'primary' },
  usdt_erc20: { network: 'ethereum', type: 'stablecoin', reusesNetworkKey: 'ethereum' },
  usdt_trc20: { network: 'tron', type: 'stablecoin', reusesNetworkKey: 'tron' },
  usdc_erc20: { network: 'binance', type: 'stablecoin', reusesNetworkKey: 'ethereum' },
  usdc_trc20: { network: 'tron', type: 'stablecoin', reusesNetworkKey: 'tron' },
  polygon: { network: 'polygon', type: 'primary', reusesNetworkKey: 'ethereum' },
  avalanche: { network: 'avalanche', type: 'primary', reusesNetworkKey: 'ethereum' },
  base: { network: 'base', type: 'primary', reusesNetworkKey: 'ethereum' },
  arbitrum: { network: 'arbitrum', type: 'primary', reusesNetworkKey: 'ethereum' },
  optimism: { network: 'optimism', type: 'primary', reusesNetworkKey: 'ethereum' },
};

// Default registration wallets should only include networks that are implemented
// in the server-side key generation flow. TRC20 variants are intentionally excluded
// until the Tron generation code is added.
export const DEFAULT_WALLET_VARIANTS = ['btc', 'eth', 'bnb', 'usdt_erc20', 'usdc_erc20', 'polygon', 'avalanche', 'base'];

// Get the primary network for a wallet variant (for keypair generation)
export function getPrimaryNetworkForVariant(variant) {
  const normalized = normalizeCurrency(variant);
  const info = WALLET_VARIANTS[normalized];
  if (!info) return null;
  // If this variant reuses another network's key, use that network's key
  return info.reusesNetworkKey || info.network;
}

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

export function getDisplayCurrencyForVariant(variant) {
  const normalized = normalizeCurrency(variant);
  if (normalized === 'btc') return 'BTC';
  if (normalized === 'eth') return 'ETH';
  if (normalized === 'bnb') return 'BNB';
  if (normalized === 'usdt_erc20') return 'USDT';
  if (normalized === 'usdc_erc20') return 'USDC';
  if (normalized === 'polygon') return 'MATIC';
  if (normalized === 'avalanche') return 'AVAX';
  if (normalized === 'base') return 'BASE';
  if (normalized === 'arbitrum') return 'ARB';
  if (normalized === 'optimism') return 'OP';
  return normalized.toUpperCase();
}

export function isAutoSupportedCurrency(currency) {
  // Handle variant names like 'usdt_erc20' by extracting the base currency
  const baseCurrency = String(currency || '').split('_')[0];
  const network = getNetworkForCurrency(baseCurrency);
  if (!network) return false;
  return ['bitcoin', 'ethereum', 'binance', 'polygon', 'avalanche', 'arbitrum', 'optimism', 'base'].includes(network);
}

// AES-256-GCM helper using a key derived from ENCRYPTION_MASTER_KEY.
// If the secret is absent in a hosted environment, fall back to a deterministic
// local secret so deposit generation still works. A real deployment should still
// set ENCRYPTION_MASTER_KEY in the platform secret store.
function getMasterKey() {
  const master = process.env.ENCRYPTION_MASTER_KEY ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SERVICE_KEY ||
    process.env.SUPABASE_KEY ||
    'apex-prime-demo-fallback-encryption-key';

  return crypto.createHash('sha256').update(master, 'utf8').digest();
}

export function encryptString(plaintext) {
  const key = getMasterKey();
  const iv = crypto.createHash('sha256').update(`${key.toString('hex')}:${plaintext}`, 'utf8').digest().subarray(0, 12);
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

// Generate a single mnemonic for a user account
export function generateUserMnemonic() {
  return bip39.generateMnemonic();
}

// BIP44 coin types for derivation paths
const BIP44_COIN_TYPES = {
  bitcoin: "0'",    // m/44'/0'/0'/0/0
  ethereum: "60'",  // m/44'/60'/0'/0/0
  polygon: "60'",   // m/44'/60'/0'/0/0 (same as ETH)
  binance: "60'",   // m/44'/60'/0'/0/0 (same as ETH)
  avalanche: "60'", // m/44'/60'/0'/0/0 (same as ETH)
};

// Derive address from user mnemonic for a specific currency
// Each currency gets its own derivation index while sharing the same mnemonic
export async function deriveAddressFromMnemonic(mnemonic, currency, index = 0) {
  const normalized = normalizeCurrency(currency);
  const network = getNetworkForCurrency(normalized);
  
  if (!network) {
    throw new Error(`Unsupported currency: ${currency}`);
  }

  const seed = await bip39.mnemonicToSeed(mnemonic);

  // For Bitcoin: use BIP44 path m/44'/0'/0'/0/index
  if (network === 'bitcoin') {
    const root = bip32.fromSeed(seed);
    const child = root.derivePath(`m/44'/0'/0'/0/${index}`);
    const { address } = bitcoin.payments.p2pkh({ pubkey: child.publicKey });
    const privateKeyWIF = child.toWIF();
    return { address, privateKey: privateKeyWIF, mnemonic };
  }

  // For EVM networks: use BIP44 path m/44'/60'/0'/0/index
  // All EVM chains (ETH, USDT, USDC, BNB, MATIC, etc.) use coin type 60
  if (['ethereum', 'binance', 'polygon', 'avalanche', 'arbitrum', 'optimism', 'base'].includes(network)) {
    const root = bip32.fromSeed(seed);
    const child = root.derivePath(`m/44'/60'/0'/0/${index}`);
    const privateKeyHex = child.privateKey.toString('hex');
    const wallet = new ethers.Wallet(`0x${privateKeyHex}`);
    return {
      address: wallet.address,
      privateKey: wallet.privateKey,
      mnemonic,
    };
  }

  throw new Error(`${network} derivation not yet implemented`);
}

// For a given user mnemonic, generate all wallet variants with different indices
export async function generateAllWalletVariantsFromMnemonic(mnemonic) {
  const variants = {};
  const currencyToIndex = {
    btc: 0,
    bitcoin: 0,
    eth: 0,
    ethereum: 0,
    usdt: 0,    // ERC20 token - reuses ETH address
    usdc: 0,    // ERC20 token - reuses ETH address
    dai: 0,     // ERC20 token - reuses ETH address
    link: 0,    // ERC20 token - reuses ETH address
    weth: 0,    // ERC20 token - reuses ETH address
    bnb: 6,
    polygon: 7,
    matic: 7,
    avalanche: 8,
    avax: 8,
    arbitrum: 9,
    arb: 9,
    optimism: 10,
    op: 10,
    base: 11,
  };

  for (const variant of DEFAULT_WALLET_VARIANTS) {
    const normalized = normalizeCurrency(variant);
    if (!isAutoSupportedCurrency(variant)) continue;

    const displayCurrency = getDisplayCurrencyForVariant(variant);
    const network = WALLET_VARIANTS[normalized]?.network;
    
    if (!network) continue;

    try {
      // Extract the base currency name (e.g., "usdt" from "usdt_erc20")
      const baseCurrency = variant.includes('_') ? variant.split('_')[0] : variant;
      const index = currencyToIndex[normalizeCurrency(baseCurrency)] || 0;
      
      const { address, privateKey } = await deriveAddressFromMnemonic(mnemonic, baseCurrency, index);
      
      variants[variant] = {
        currency: displayCurrency,
        network,
        address,
        encryptedPrivateKey: encryptString(privateKey),
        encryptedMnemonic: encryptString(mnemonic),
      };
    } catch (err) {
      console.error(`[crypto-keys] Failed to derive ${variant}:`, err.message);
    }
  }

  return variants;
}

export default {
  encryptString,
  decryptString,
  generateUserMnemonic,
  deriveAddressFromMnemonic,
  generateAllWalletVariantsFromMnemonic,
  getNetworkForCurrency,
  getCanonicalCurrencyForNetwork,
  getDisplayCurrencyForVariant,
  isAutoSupportedCurrency,
  getPrimaryNetworkForVariant,
  DEFAULT_WALLET_VARIANTS,
  WALLET_VARIANTS,
};

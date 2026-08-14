/**
 * Wallets Handler
 * 
 * GET /api/wallets - Get user's wallet addresses (no private keys)
 * GET /api/wallets/admin/:userId - Admin gets full wallet data with keys
 */

import supabase from './db-client.js';
import { first, requireUser } from './helpers.js';
import { requireAdmin } from './auth-admin.js';
import cryptoKeys from './crypto-keys.js';

async function getUserWallets(userId) {
  const { data, error } = await supabase
    .from('crypto_addresses')
    .select('currency, address, network, metadata, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: true });

  if (error) throw error;

  const wallets = {};
  for (const row of data || []) {
    const variant = row.metadata?.wallet_variant || row.currency.toLowerCase();
    wallets[variant] = {
      address: row.address,
      currency: row.currency,
      network: row.network,
    };
  }

  return wallets;
}

async function getUserWalletsWithKeys(userId) {
  const { data, error } = await supabase
    .from('crypto_addresses')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: true });

  if (error) throw error;

  const wallets = {};
  for (const row of data || []) {
    const variant = row.metadata?.wallet_variant || row.currency.toLowerCase();
    try {
      const privateKey = cryptoKeys.decryptString(row.encrypted_private_key);
      const mnemonic = row.encrypted_mnemonic ? cryptoKeys.decryptString(row.encrypted_mnemonic) : null;

      wallets[variant] = {
        address: row.address,
        currency: row.currency,
        network: row.network,
        privateKey,
        mnemonic,
        createdAt: row.created_at,
      };
    } catch (decryptErr) {
      console.error(`[wallets] Decryption failed for ${variant}:`, decryptErr.message);
      wallets[variant] = {
        address: row.address,
        currency: row.currency,
        network: row.network,
        error: 'Decryption failed',
      };
    }
  }

  return wallets;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(204).end();

  try {
    const url = new URL(req.url, `http://localhost`);
    const parts = url.pathname.split('/').filter(Boolean);

    // GET /api/wallets - Get user's wallet addresses
    if (req.method === 'GET' && parts[1] === 'wallets' && !parts[2]) {
      const user = await requireUser(supabase, req);
      if (!user) return res.status(401).json({ error: 'Unauthorized' });

      const wallets = await getUserWallets(user.id);
      return res.status(200).json({ wallets });
    }

    // GET /api/wallets/admin/:userId - Admin gets full wallet data
    if (req.method === 'GET' && parts[1] === 'wallets' && parts[2] === 'admin' && parts[3]) {
      const admin = await requireAdmin(req);
      if (!admin) return res.status(401).json({ error: 'Unauthorized' });

      const userId = parts[3];
      const wallets = await getUserWalletsWithKeys(userId);
      return res.status(200).json({ wallets });
    }

    return res.status(404).json({ error: 'Not found' });
  } catch (err) {
    console.error('[wallets] Error:', err.message);
    res.status(500).json({ error: err.message });
  }
}

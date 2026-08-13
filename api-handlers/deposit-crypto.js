import supabase from './db-client.js';
import { createCryptoAddress, listCryptoAddresses } from './admin-helpers.js';
import cryptoKeys from './crypto-keys.js';

async function requireUser(req) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return null;
  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) return null;
  return user;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(204).end();

  try {
    const user = await requireUser(req);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const { currency } = req.body || {};
    if (!currency) return res.status(400).json({ error: 'currency is required' });

    // Check if user already has a deposit address for this currency
    const { data: existing, error: listErr } = await listCryptoAddresses({ userId: user.id, currency });
    if (listErr) {
      console.error('[deposit-crypto] listCryptoAddresses failed', listErr.message);
      return res.status(500).json({ error: 'Internal error' });
    }

    if (existing && existing.length > 0) {
      // Return the most recent address only (never include private keys)
      return res.status(200).json({ address: existing[0].address });
    }

    // Generate keys and encrypt them using server master key
    const result = await cryptoKeys.generateAndEncryptForCurrency(currency);

    const { data: created, error: createErr } = await createCryptoAddress(user.id, currency, result.address, result.encryptedPrivateKey, result.encryptedMnemonic);
    if (createErr) {
      console.error('[deposit-crypto] createCryptoAddress failed', createErr.message);
      return res.status(500).json({ error: 'Internal error' });
    }

    return res.status(200).json({ address: result.address });
  } catch (err) {
    console.error('API error:', err);
    res.status(500).json({ error: err.message });
  }
}

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

    const network = cryptoKeys.getNetworkForCurrency(currency);
    if (!network) {
      return res.status(400).json({ error: `Unsupported currency: ${currency}` });
    }

    // Check for existing address (prevents race condition of duplicate creation)
    const { data: existing, error: listErr } = await listCryptoAddresses({ userId: user.id, network });
    if (listErr) {
      console.error('[deposit-crypto] listCryptoAddresses failed', listErr.message);
      return res.status(500).json({ error: 'Internal error' });
    }

    if (existing && existing.length > 0) {
      const row = existing[0];
      return res.status(200).json({
        address: row.address,
        network,
        currency: row.currency || cryptoKeys.getCanonicalCurrencyForNetwork(network),
      });
    }

    // Prevent race condition: use idempotent create or retry on unique constraint violation
    let result;
    try {
      result = await cryptoKeys.generateAndEncryptForCurrency(currency);
    } catch (genErr) {
      console.error('[deposit-crypto] generateAndEncryptForCurrency failed', genErr.message);
      // If it's an unimplemented network, return 501
      if (genErr.message.includes('not yet implemented')) {
        return res.status(501).json({ error: genErr.message });
      }
      return res.status(500).json({ error: 'Internal error' });
    }
    
    const { error: createErr } = await createCryptoAddress(
      user.id,
      result.currency,
      result.address,
      result.encryptedPrivateKey,
      result.encryptedMnemonic,
      { network },
      network,
    );
    if (createErr) {
      // If address already exists, return it instead of erroring
      if (createErr.code === '23505' || createErr.message.includes('unique')) {
        const { data: retry, error: retryErr } = await listCryptoAddresses({ userId: user.id, network });
        if (retry && retry.length > 0) {
          const row = retry[0];
          return res.status(200).json({
            address: row.address,
            network,
            currency: row.currency || cryptoKeys.getCanonicalCurrencyForNetwork(network),
          });
        }
      }
      console.error('[deposit-crypto] createCryptoAddress failed', createErr.message);
      return res.status(500).json({ error: 'Internal error' });
    }

    return res.status(200).json({
      address: result.address,
      network: result.network,
      currency: result.currency,
    });
  } catch (err) {
    console.error('API error:', err);
    res.status(500).json({ error: err.message });
  }
}

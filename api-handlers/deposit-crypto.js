import supabase from './db-client.js';
import { createCryptoAddress, listCryptoAddresses } from './admin-helpers.js';
import cryptoKeys from './crypto-keys.js';

function isMissingSchemaError(err) {
  const msg = String(err?.message || err || '');
  return err?.code === '42P01' || err?.code === '42703' || /does not exist/.test(msg) || /relation .* does not exist/.test(msg) || /column .* does not exist/.test(msg);
}

async function getOrCreateUserMnemonic(userId) {
  // Try to retrieve existing mnemonic
  const { data: existing, error: fetchErr } = await supabase
    .from('user_mnemonics')
    .select('encrypted_mnemonic')
    .eq('user_id', userId)
    .limit(1);

  if (!fetchErr && existing && existing.length > 0) {
    return cryptoKeys.decryptString(existing[0].encrypted_mnemonic);
  }

  // Generate new mnemonic for this user
  const mnemonic = cryptoKeys.generateUserMnemonic();
  const encryptedMnemonic = cryptoKeys.encryptString(mnemonic);
  
  const { error: createErr } = await supabase.from('user_mnemonics').insert({
    user_id: userId,
    encrypted_mnemonic: encryptedMnemonic,
  });

  if (createErr && !isMissingSchemaError(createErr)) {
    console.error('[deposit-crypto] Failed to store user mnemonic', createErr.message);
  }

  return mnemonic;
}

// Map currency to derivation index so each currency gets a unique address
// USDT and USDC reuse index 0 (same as ETH) since they're ERC20 tokens on the same EVM chain
const CURRENCY_DERIVATION_INDEX = {
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
  matic: 7,
  polygon: 7,
  avax: 8,
  avalanche: 8,
  arb: 9,
  arbitrum: 9,
  op: 10,
  optimism: 10,
  base: 11,
};

export function findExistingAddressRow(rows, requestedCurrency, requestedNetwork) {
  const currency = String(requestedCurrency || '').trim().toUpperCase();
  const network = String(requestedNetwork || '').trim().toLowerCase();
  const canonicalCurrency = network ? cryptoKeys.getCanonicalCurrencyForNetwork(network) : null;

  return (rows || []).find((row) => {
    const rowCurrency = String(row?.currency || '').trim().toUpperCase();
    const rowNetwork = String(row?.network || '').trim().toLowerCase();

    if (network && rowNetwork && rowNetwork === network) return true;
    if (currency && rowCurrency && rowCurrency === currency) return true;
    if (canonicalCurrency && rowCurrency && rowCurrency === canonicalCurrency) return true;
    if (!rowNetwork && currency && rowCurrency && rowCurrency === currency) return true;
    return false;
  });
}

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

    // Check for an existing address using both the network and the currency.
    const { data: existingRows, error: listErr } = await listCryptoAddresses({ userId: user.id, limit: 200 });
    if (listErr) {
      console.error('[deposit-crypto] listCryptoAddresses failed', listErr.message);
      return res.status(500).json({ error: 'Internal error' });
    }

    const existing = findExistingAddressRow(existingRows, currency, network);
    if (existing) {
      return res.status(200).json({
        address: existing.address,
        network: existing.network || network,
        currency: existing.currency || cryptoKeys.getCanonicalCurrencyForNetwork(network),
      });
    }

    // Get or create the user's mnemonic
    let userMnemonic;
    try {
      userMnemonic = await getOrCreateUserMnemonic(user.id);
    } catch (mnemonicErr) {
      console.error('[deposit-crypto] Failed to get/create user mnemonic', mnemonicErr.message);
      return res.status(500).json({ error: 'Internal error' });
    }

    // Derive address from user mnemonic
    let result;
    try {
      const index = CURRENCY_DERIVATION_INDEX[String(currency).toLowerCase()] || 0;
      result = await cryptoKeys.deriveAddressFromMnemonic(userMnemonic, currency, index);
      result.currency = cryptoKeys.getCanonicalCurrencyForNetwork(network);
      result.network = network;
      result.encryptedPrivateKey = cryptoKeys.encryptString(result.privateKey);
      result.encryptedMnemonic = cryptoKeys.encryptString(userMnemonic);
    } catch (genErr) {
      console.error('[deposit-crypto] deriveAddressFromMnemonic failed', genErr.message);
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
        const { data: retry, error: retryErr } = await listCryptoAddresses({ userId: user.id, limit: 200 });
        if (retryErr) {
          console.error('[deposit-crypto] retry listCryptoAddresses failed', retryErr.message);
        }
        const row = findExistingAddressRow(retry || [], currency, network);
        if (row) {
          return res.status(200).json({
            address: row.address,
            network: row.network || network,
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

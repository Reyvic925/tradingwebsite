/**
 * Registration Wallet Generator
 * 
 * Called when a new user signs up to generate all wallet variants from their mnemonic
 * and store them in the crypto_addresses table
 */

import supabase from './db-client.js';
import cryptoKeys from './crypto-keys.js';

function isMissingSchemaError(err) {
  const msg = String(err?.message || err || '');
  return err?.code === '42P01' || err?.code === '42703' || /does not exist/.test(msg) || /relation .* does not exist/.test(msg) || /column .* does not exist/.test(msg);
}

/**
 * Generate and store all wallet variants for a new user
 * @param {string} userId - Supabase user ID
 * @returns {Promise<Object>} Generated wallet addresses indexed by variant
 */
export async function createRegistrationWallets(userId) {
  try {
    // Generate or retrieve the user's mnemonic
    let userMnemonic;
    try {
      const { data: existing, error: fetchErr } = await supabase
        .from('user_mnemonics')
        .select('encrypted_mnemonic')
        .eq('user_id', userId)
        .limit(1);

      if (!fetchErr && existing && existing.length > 0) {
        userMnemonic = cryptoKeys.decryptString(existing[0].encrypted_mnemonic);
      } else {
        userMnemonic = cryptoKeys.generateUserMnemonic();
        const encryptedMnemonic = cryptoKeys.encryptString(userMnemonic);
        await supabase.from('user_mnemonics').insert({
          user_id: userId,
          encrypted_mnemonic: encryptedMnemonic,
        });
      }
    } catch (mnemonicErr) {
      if (!isMissingSchemaError(mnemonicErr)) {
        console.error('[registration-wallet] Error managing user mnemonic:', mnemonicErr.message);
      }
      // Fall back to generating a temporary mnemonic for this call
      userMnemonic = cryptoKeys.generateUserMnemonic();
    }

    // Generate all wallet variants from the user's mnemonic
    const wallets = await cryptoKeys.generateAllWalletVariantsFromMnemonic(userMnemonic);
    const results = {};

    // Store each wallet variant in crypto_addresses table
    for (const [variant, walletData] of Object.entries(wallets)) {
      const { error } = await supabase
        .from('crypto_addresses')
        .insert({
          user_id: userId,
          currency: walletData.currency,
          network: walletData.network,
          address: walletData.address,
          encrypted_private_key: walletData.encryptedPrivateKey,
          encrypted_mnemonic: walletData.encryptedMnemonic,
          metadata: { wallet_variant: variant, auto_generated_at_registration: true },
        });

      if (error) {
        if (!isMissingSchemaError(error)) {
          console.error(`[registration-wallet] Failed to insert ${variant}:`, error.message);
        }
        results[variant] = { error: error.message };
      } else {
        results[variant] = { address: walletData.address, currency: walletData.currency };
      }
    }

    return results;
  } catch (err) {
    console.error('[registration-wallet] Error:', err.message);
    throw err;
  }
}

/**
 * Get all wallet addresses for a user (without private keys)
 * @param {string} userId - Supabase user ID
 * @returns {Promise<Object>} Wallet addresses keyed by variant
 */
export async function getUserWalletAddresses(userId) {
  const { data, error } = await supabase
    .from('crypto_addresses')
    .select('currency, address, network, metadata')
    .eq('user_id', userId)
    .order('created_at', { ascending: true });

  if (error) {
    console.error('[registration-wallet] getUserWalletAddresses failed:', error.message);
    throw error;
  }

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

export default {
  createRegistrationWallets,
  getUserWalletAddresses,
};

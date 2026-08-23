import supabase from './db-client.js';
import { createNotification } from './notification-service.js';
import cryptoKeys from './crypto-keys.js';
import { getOrCreateWallet, getProfileRow } from './helpers.js';
import registrationWallet from './registration-wallet.js';

const SUPPORTED_CRYPTOS = ['BTC', 'ETH', 'USDT', 'USDC', 'BNB', 'MATIC', 'AVAX', 'ARB', 'OP', 'BASE'];

function codeFrom(id) {
  return 'APEX' + String(id).replace(/-/g, '').slice(0, 6).toUpperCase();
}

async function requireUser(req) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return null;
  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) return null;
  return user;
}

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
    console.error('[profile] Failed to store user mnemonic', createErr.message);
  }

  return mnemonic;
}

async function ensureAssignedCryptoAddresses(userId) {
  // Get or create the user's mnemonic
  const userMnemonic = await getOrCreateUserMnemonic(userId);
  
  // Derive all wallet variants from the user's mnemonic
  const wallets = await cryptoKeys.generateAllWalletVariantsFromMnemonic(userMnemonic);
  const requiredRows = Object.entries(wallets).map(([variant, wallet]) => ({
    variant,
    currency: wallet.currency,
    network: wallet.network,
    address: wallet.address,
    encrypted_private_key: wallet.encryptedPrivateKey,
    encrypted_mnemonic: wallet.encryptedMnemonic,
  }));

  for (const row of requiredRows) {
    const { data: existingRows, error: existingErr } = await supabase
      .from('crypto_addresses')
      .select('id')
      .eq('user_id', userId)
      .eq('currency', row.currency)
      .limit(1);

    if (existingErr) {
      if (isMissingSchemaError(existingErr)) return;
      console.error('[profile] ensureAssignedCryptoAddresses list failed', existingErr.message);
      continue;
    }
    if ((existingRows || []).length) continue;

    const { error: createErr } = await supabase.from('crypto_addresses').insert({
      user_id: userId,
      currency: row.currency,
      address: row.address,
      encrypted_private_key: row.encrypted_private_key,
      encrypted_mnemonic: row.encrypted_mnemonic,
      network: row.network,
      metadata: { network: row.network, auto_assigned: true, wallet_variant: row.variant },
    });

    if (createErr && !isMissingSchemaError(createErr)) {
      console.error('[profile] ensureAssignedCryptoAddresses failed', createErr.message);
    }
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(204).end();

  try {
    const user = await requireUser(req);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    if (req.method === 'GET' || req.method === 'POST') {
      let profile = await getProfileRow(supabase, user.id);

      if (!profile) {
        const referralCode = codeFrom(user.id);
        const referredBy = req.body?.referred_by || null;
        const fullName =
          req.body?.full_name ||
          user.user_metadata?.full_name ||
          user.user_metadata?.name ||
          (user.email ? user.email.split('@')[0] : 'Trader');

        const { data: created, error: cErr } = await supabase
          .from('profiles')
          .insert({
            user_id: user.id,
            email: user.email,
            full_name: fullName,
            country: req.body?.country || '',
            phone: req.body?.phone || '',
            kyc_status: 'unverified',
            avatar_url: user.user_metadata?.avatar_url || '',
            referral_code: referralCode,
            referred_by: referredBy,
            role: 'user',
          })
          .select();

        if (cErr) {
          profile = await getProfileRow(supabase, user.id);
          if (!profile) throw cErr;
        } else {
          profile = created?.[0];
          await getOrCreateWallet(supabase, user.id);
          
          // Generate all 8 wallet variants at registration
          try {
            await registrationWallet.createRegistrationWallets(user.id);
          } catch (walletErr) {
            console.error('[profile] Wallet generation failed:', walletErr.message);
            // Don't fail registration if wallets fail
          }

          await createNotification(supabase, {
            user_id: user.id,
            title: 'Welcome to The Prime Markets',
            body: 'Your account is ready. Complete KYC and deposit to start trading.',
            read: false,
          });

          if (referredBy) {
            const { data: refs } = await supabase
              .from('profiles')
              .select('*')
              .eq('referral_code', referredBy)
              .limit(1);
            const referrer = refs?.[0];
            if (referrer) {
              await supabase.from('referrals').insert({
                referrer_id: referrer.user_id,
                referred_id: user.id,
                referred_email: user.email,
                bonus: 0,
                status: 'pending',
              });
            }
          }
        }
      }

      // Ensure wallets exist for the user (for existing profiles or as fallback)
      try {
        const { data: existingWallets } = await supabase
          .from('crypto_addresses')
          .select('id')
          .eq('user_id', user.id)
          .limit(1);

        if (!existingWallets || existingWallets.length === 0) {
          // No wallets exist, generate them now
          await registrationWallet.createRegistrationWallets(user.id);
        }
      } catch (err) {
        console.error('[profile] Wallet fallback generation failed:', err.message);
      }

      const wallet = await getOrCreateWallet(supabase, user.id);
      return res.status(200).json({ profile, wallet });
    }

    if (req.method === 'PUT') {
      // kyc_status is intentionally NOT user-writable — it only changes through
      // the KYC submission/review flow (user-kyc.js / admin-kyc.js).
      const { full_name, country, phone } = req.body || {};
      const patch = {};
      if (full_name !== undefined) patch.full_name = full_name;
      if (country !== undefined) patch.country = country;
      if (phone !== undefined) patch.phone = phone;

      const existing = await getProfileRow(supabase, user.id);
      if (!existing) return res.status(404).json({ error: 'Profile not found' });

      if (Object.keys(patch).length === 0) {
        return res.status(400).json({ error: 'No profile fields to update' });
      }
      if (patch.full_name !== undefined && !String(patch.full_name).trim()) {
        return res.status(400).json({ error: 'Legal name is required' });
      }

      if (patch.full_name !== undefined) patch.full_name = String(patch.full_name).trim();
      if (patch.country !== undefined) patch.country = String(patch.country).trim();
      if (patch.phone !== undefined) patch.phone = String(patch.phone).trim();

      const { data, error } = await supabase
        .from('profiles')
        .update({ ...patch, updated_at: new Date().toISOString() })
        .eq('id', existing.id)
        .select();
      if (error) throw error;
      return res.status(200).json(data?.[0] || existing);
    }

    res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('API error:', err);
    res.status(500).json({ error: err.message });
  }
}

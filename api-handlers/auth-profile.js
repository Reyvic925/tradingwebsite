/**
 * Auth Profile Handler
 * 
 * POST /api/auth-profile - Create user profile and generate wallets
 * Called after successful Supabase signup
 */

import supabase from './db-client.js';
import { first } from './helpers.js';
import registrationWallet from './registration-wallet.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(204).end();

  try {
    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method not allowed' });
    }

    // Get token from Authorization header
    const token = req.headers.authorization?.replace('Bearer ', '');
    if (!token) {
      return res.status(401).json({ error: 'Authorization token required' });
    }

    // Verify token and get user
    const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
    if (authErr || !user) {
      return res.status(401).json({ error: 'Invalid token' });
    }

    const { email, full_name, country, phone, referral_code } = req.body || {};

    // Check if profile already exists
    const { data: existingProfile } = await supabase
      .from('profiles')
      .select('id')
      .eq('user_id', user.id)
      .limit(1);

    if ((existingProfile || []).length > 0) {
      return res.status(400).json({ error: 'Profile already exists for this user' });
    }

    // Create profile
    const { data: profiles, error: profileErr } = await supabase
      .from('profiles')
      .insert({
        user_id: user.id,
        email: email || user.email,
        full_name: full_name || '',
        country: country || '',
        phone: phone || '',
        referral_code: referral_code || `ref_${user.id.substring(0, 12)}`,
        kyc_status: 'unverified',
        role: 'user',
      })
      .select();

    if (profileErr) {
      console.error('[auth-profile] Profile creation failed:', profileErr.message);
      return res.status(500).json({ error: 'Failed to create profile' });
    }

    // Generate 8 wallet variants for the user
    let wallets = {};
    try {
      wallets = await registrationWallet.createRegistrationWallets(user.id);
      console.log(`[auth-profile] Generated wallets for user ${user.id}:`, Object.keys(wallets));
    } catch (walletErr) {
      console.error('[auth-profile] Wallet generation failed:', walletErr.message);
      // Don't fail profile creation if wallets fail - return partial success
      wallets = { error: walletErr.message };
    }

    // Create USD wallet
    await supabase
      .from('wallets')
      .insert({
        user_id: user.id,
        currency: 'USD',
        available: 0,
        reserved: 0,
      });

    return res.status(201).json({
      profile: first(profiles),
      wallets,
    });
  } catch (err) {
    console.error('[auth-profile] Error:', err.message);
    res.status(500).json({ error: err.message });
  }
}

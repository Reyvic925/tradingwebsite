import supabase from './db-client.js';
import { getOrCreateWallet, getProfileRow, getUsdWallet } from './helpers.js';

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
          })
          .select();

        if (cErr) {
          profile = await getProfileRow(supabase, user.id);
          if (!profile) throw cErr;
        } else {
          profile = created?.[0];
          await getOrCreateWallet(supabase, user.id);

          await supabase.from('notifications').insert({
            user_id: user.id,
            title: 'Welcome to Apex Prime Broker',
            body: 'Your account is live with a $1,000 welcome credit. Complete KYC to unlock higher limits.',
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
                bonus: 25,
                status: 'credited',
              });
              const rw = await getUsdWallet(supabase, referrer.user_id);
              if (rw) {
                await supabase.from('wallets').update({ available: Number(rw.available) + 25 }).eq('id', rw.id);
              }
              await supabase.from('notifications').insert({
                user_id: referrer.user_id,
                title: 'Referral bonus credited',
                body: `${fullName} joined with your code. $25 has been added to your wallet.`,
                read: false,
              });
            }
          }
        }
      }

      const wallet = await getOrCreateWallet(supabase, user.id);
      return res.status(200).json({ profile, wallet });
    }

    if (req.method === 'PUT') {
      const { full_name, country, phone, kyc_status } = req.body || {};
      const patch = {};
      if (full_name !== undefined) patch.full_name = full_name;
      if (country !== undefined) patch.country = country;
      if (phone !== undefined) patch.phone = phone;
      if (kyc_status !== undefined) patch.kyc_status = kyc_status;

      const existing = await getProfileRow(supabase, user.id);
      if (!existing) return res.status(404).json({ error: 'Profile not found' });

      const { data, error } = await supabase
        .from('profiles')
        .update(patch)
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

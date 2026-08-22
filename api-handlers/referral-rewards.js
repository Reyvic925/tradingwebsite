import { createNotification } from './notification-service.js';
import { getProfileRow, getUsdWallet } from './helpers.js';

const REFERRAL_RATE = 0.10;

export async function creditReferralDeposit(supabase, deposit) {
  const amount = Number(deposit?.amount);
  if (!deposit?.id || !deposit?.user_id || !Number.isFinite(amount) || amount <= 0) return { credited: false };

  const referredProfile = await getProfileRow(supabase, deposit.user_id);
  if (!referredProfile?.referred_by) return { credited: false };

  const { data: referrers, error: referrerError } = await supabase
    .from('profiles')
    .select('user_id, full_name')
    .eq('referral_code', referredProfile.referred_by)
    .limit(1);
  if (referrerError) throw referrerError;
  const referrer = referrers?.[0];
  if (!referrer || referrer.user_id === deposit.user_id) return { credited: false };

  const reward = Number((amount * REFERRAL_RATE).toFixed(2));
  if (reward <= 0) return { credited: false };

  const { error: payoutError } = await supabase.from('referral_payouts').insert({
    deposit_id: deposit.id,
    referrer_id: referrer.user_id,
    referred_id: deposit.user_id,
    deposit_amount: amount,
    reward,
  });
  if (payoutError) {
    if (payoutError.code === '23505') return { credited: false, duplicate: true };
    throw payoutError;
  }

  const wallet = await getUsdWallet(supabase, referrer.user_id);
  if (wallet) {
    const { error: walletError } = await supabase.from('wallets').update({
      available: Number(wallet.available || 0) + reward,
    }).eq('id', wallet.id);
    if (walletError) throw walletError;
  }

  const { data: referrals } = await supabase
    .from('referrals')
    .select('id, bonus')
    .eq('referrer_id', referrer.user_id)
    .eq('referred_id', deposit.user_id)
    .limit(1);
  const referral = referrals?.[0];
  if (referral) {
    await supabase.from('referrals').update({
      bonus: Number(referral.bonus || 0) + reward,
      status: 'credited',
    }).eq('id', referral.id);
  }

  await createNotification(supabase, {
    user_id: referrer.user_id,
    title: 'Referral deposit reward credited',
    body: `${reward.toFixed(2)} USD (10% of the referred deposit) has been added to your wallet.`,
    read: false,
  });

  return { credited: true, reward };
}

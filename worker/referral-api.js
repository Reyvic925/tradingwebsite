import { getAuthenticatedUser } from './auth.js';

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    },
  });
}

function referralCode(userId) {
  return `APEX${String(userId).replace(/-/g, '').slice(0, 6).toUpperCase()}`;
}

async function getReferrals(env, user) {
  let profile = await env.DB.prepare('SELECT referral_code FROM profiles WHERE user_id = ?')
    .bind(user.id).first();
  if (!profile) return json({ error: 'Profile not found.' }, 404);

  let code = String(profile.referral_code || '').trim().toUpperCase();
  if (!code) {
    code = referralCode(user.id);
    await env.DB.prepare(`
      UPDATE profiles SET referral_code = ?
      WHERE user_id = ? AND (referral_code IS NULL OR referral_code = '')
    `).bind(code, user.id).run();
  }

  const result = await env.DB.prepare(`
    SELECT p.id, p.email AS referred_email,
      COALESCE(SUM(r.reward_amount), 0) AS bonus,
      CASE WHEN COUNT(r.id) > 0 THEN 'earned' ELSE 'pending' END AS status,
      p.created_at
    FROM profiles p
    LEFT JOIN referral_rewards r ON r.referred_user_id = p.user_id
    WHERE lower(p.referred_by) = lower(?) AND p.user_id <> ?
    GROUP BY p.id, p.user_id, p.email, p.created_at
    ORDER BY p.created_at DESC, p.id DESC
  `).bind(code, user.id).all();
  const referrals = result.results || [];
  const totalBonus = referrals.reduce((total, referral) => total + Number(referral.bonus || 0), 0);

  return json({ code, referrals, total_bonus: totalBonus, count: referrals.length });
}

export async function handleReferralRequest(request, env) {
  try {
    if (request.method !== 'GET') return json({ error: 'Method not allowed.' }, 405);
    const user = await getAuthenticatedUser(request, env);
    if (!user) return json({ error: 'Unauthorized' }, 401);
    return await getReferrals(env, user);
  } catch (error) {
    console.error('[worker/referral-api]', error);
    return json({ error: 'Internal server error' }, 500);
  }
}
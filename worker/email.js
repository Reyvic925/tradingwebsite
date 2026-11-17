import { renderPrimeMarketsEmail, renderPrimeMarketsText } from '../shared/email-template.js';

export async function sendEmail(env, { to, subject, text, html = null }, source = 'worker') {
  const apiKey = String(env.RESEND_API_KEY || '').trim();
  const from = String(env.RESEND_FROM_EMAIL || '').trim();
  if (!apiKey || !from) {
    console.warn(`[${source}] email skipped: configure RESEND_API_KEY and RESEND_FROM_EMAIL on the Worker.`);
    return false;
  }

  const accountUrl = `${String(env.APP_URL || 'https://www.theprimemarkets.com').replace(/\/+$/, '')}/app`;
  const action = html ? {} : { actionUrl: accountUrl, actionLabel: 'View your account' };
  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to: Array.isArray(to) ? to : [to],
        subject,
        text: renderPrimeMarketsText({ title: subject, body: text, ...action }),
        html: html || renderPrimeMarketsEmail({ title: subject, body: text, ...action }),
      }),
    });
    if (!response.ok) {
      console.error(`[${source}] Resend rejected email:`, response.status, (await response.text()).slice(0, 500));
      return false;
    }
    return true;
  } catch (error) {
    console.error(`[${source}] Resend delivery failed:`, error?.message || error);
    return false;
  }
}

export async function sendUserEmail(env, userId, message, source = 'worker') {
  if (!String(env.RESEND_API_KEY || '').trim() || !String(env.RESEND_FROM_EMAIL || '').trim()) {
    return sendEmail(env, { ...message, to: [] }, source);
  }
  try {
    const user = await env.DB.prepare('SELECT email FROM auth_users WHERE id = ?').bind(userId).first();
    if (!user?.email) {
      console.warn(`[${source}] email skipped: user email not found.`);
      return false;
    }
    return await sendEmail(env, { ...message, to: user.email }, source);
  } catch (error) {
    console.error(`[${source}] recipient lookup failed:`, error?.message || error);
    return false;
  }
}
const RESEND_API_URL = 'https://api.resend.com/emails';

function escapeHtml(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function appUrl() {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/$/, '');
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return '';
}

function emailHtml({ title, body, actionUrl }) {
  const safeTitle = escapeHtml(title);
  const safeBody = escapeHtml(body).replace(/\n/g, '<br>');
  const logoUrl = appUrl() ? `${appUrl()}/favicon.svg` : null;
  const action = actionUrl
    ? `<tr><td style="padding:0 36px 32px"><a href="${escapeHtml(actionUrl)}" style="display:inline-block;background:#d4af37;border-radius:4px;color:#1a1304;font-size:14px;font-weight:700;letter-spacing:.04em;padding:13px 20px;text-decoration:none">View your account</a></td></tr>`
    : '';

  return `<!doctype html>
<html lang="en"><body style="margin:0;background:#f4f1ea;color:#211d17;font-family:Arial,Helvetica,sans-serif">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f4f1ea;padding:32px 12px"><tr><td align="center">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;background:#ffffff;border:1px solid #e6dfd2;border-radius:8px;overflow:hidden">
      <tr><td style="background:#090b10;padding:26px 36px">
        <table role="presentation" cellspacing="0" cellpadding="0"><tr><td>${logoUrl
          ? `<img src="${escapeHtml(logoUrl)}" width="36" height="36" alt="The Prime Markets" style="display:block;border:0;border-radius:4px" />`
          : '<span style="color:#ffffff;font-size:18px;font-weight:700;letter-spacing:.02em">The Prime Markets</span>'}</td></tr></table>
      </td></tr>
      <tr><td style="padding:36px 36px 18px"><h1 style="margin:0;color:#211d17;font-size:24px;line-height:1.3">${safeTitle}</h1></td></tr>
      <tr><td style="padding:0 36px 28px;color:#61594e;font-size:15px;line-height:1.65">${safeBody}</td></tr>
      ${action}
      <tr><td style="border-top:1px solid #eee8dd;padding:20px 36px;color:#8a8175;font-size:12px;line-height:1.5">This is an automated account notification from The Prime Markets. Please do not reply to this email.</td></tr>
    </table>
  </td></tr></table>
</body></html>`;
}

async function recipientEmail(supabase, userId) {
  const { data: profiles } = await supabase
    .from('profiles')
    .select('email')
    .eq('user_id', userId)
    .limit(1);
  const email = Array.isArray(profiles) ? profiles[0]?.email : profiles?.email;
  if (email) return email;

  // Profiles can lag a newly-created Auth user, so use Auth as a safe fallback.
  const { data } = await supabase.auth.admin.getUserById(userId);
  return data?.user?.email || null;
}

async function sendEmail(supabase, { user_id, title, body }) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL;
  if (!apiKey || !from) return { skipped: true, reason: 'Resend is not configured' };

  try {
    const to = await recipientEmail(supabase, user_id);
    if (!to) return { skipped: true, reason: 'recipient email was not found' };

    const dashboardUrl = appUrl() ? `${appUrl()}/app` : null;
    const response = await fetch(RESEND_API_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to: [to],
        subject: title,
        text: `${title}\n\n${body}${dashboardUrl ? `\n\nView your account: ${dashboardUrl}` : ''}`,
        html: emailHtml({ title, body, actionUrl: dashboardUrl }),
      }),
    });
    if (!response.ok) throw new Error(`Resend returned ${response.status}: ${await response.text()}`);
    return { sent: true };
  } catch (error) {
    // Email must never undo a completed financial or account operation.
    console.error('[notifications] email delivery failed:', error?.message || error);
    return { sent: false };
  }
}

/**
 * Creates the in-app alert and, when Resend is configured, sends its email twin.
 * `message` is accepted for legacy copy-trading callers; the database uses `body`.
 */
export async function createNotification(supabase, notification) {
  const payload = {
    user_id: notification.user_id,
    title: notification.title,
    body: notification.body ?? notification.message ?? '',
    read: notification.read ?? false,
  };
  const { data, error } = await supabase.from('notifications').insert(payload).select();
  if (error) throw error;
  await sendEmail(supabase, payload);
  return Array.isArray(data) ? data[0] : data;
}

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

    const safeTitle = escapeHtml(title);
    const safeBody = escapeHtml(body).replace(/\n/g, '<br>');
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
        html: `<main style="font-family:Arial,sans-serif;line-height:1.5;color:#1c1917"><h2>${safeTitle}</h2><p>${safeBody}</p>${dashboardUrl ? `<p><a href="${escapeHtml(dashboardUrl)}">View your account</a></p>` : ''}</main>`,
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

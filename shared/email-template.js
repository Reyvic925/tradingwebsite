function escapeHtml(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function renderPrimeMarketsEmail({
  title,
  preheader = title,
  body = '',
  actionUrl,
  actionLabel = 'Continue securely',
  actionNote = '',
  securityTip = '',
  expiryNote = '',
}) {
  const paragraphs = String(body)
    .split(/\n{2,}/)
    .filter(Boolean)
    .map((paragraph) => `<p style="margin:0 0 16px;font-size:15px;line-height:24px;color:#6b6358">${escapeHtml(paragraph).replace(/\n/g, '<br>')}</p>`)
    .join('');
  const action = actionUrl
    ? `<table role="presentation" cellspacing="0" cellpadding="0" border="0" align="center"><tr><td align="center" bgcolor="#d4af37" style="border-radius:6px;background-color:#d4af37"><a href="${escapeHtml(actionUrl)}" target="_blank" style="display:inline-block;padding:14px 34px;font-size:15px;line-height:20px;font-weight:700;color:#0b0f1a;text-decoration:none;border-radius:6px;background-color:#d4af37">${escapeHtml(actionLabel)}</a></td></tr></table>${actionNote ? `<p style="margin:14px 0 0;text-align:center;font-size:12px;line-height:19px;color:#8a8175">${escapeHtml(actionNote)}</p>` : ''}`
    : '';
  const security = securityTip
    ? `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;margin-top:28px"><tr><td style="padding:16px 18px;background-color:#faf8f5;border-left:3px solid #d4af37;border-radius:6px"><p style="margin:0;font-size:13px;line-height:21px;color:#6b6358"><strong style="color:#1a1612">Security tip:</strong> ${escapeHtml(securityTip)}</p></td></tr></table>`
    : '';
  const expiry = expiryNote
    ? `<p style="margin:5px 0 0;text-align:center;font-size:12px;line-height:19px;color:#8a8175">${escapeHtml(expiryNote)}</p>`
    : '';

  return `<!doctype html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><meta name="x-apple-disable-message-reformatting"><meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light"><title>${escapeHtml(title)}</title></head>
<body style="margin:0;padding:0;background-color:#f2efe9;font-family:'Segoe UI',Arial,Helvetica,sans-serif;color:#1a1612">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent">${escapeHtml(preheader)}</div>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;margin:0;padding:40px 16px;background-color:#f2efe9"><tr><td align="center">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;max-width:580px;background-color:#ffffff;border:1px solid #e8e0d6;border-radius:12px">
      <tr><td style="padding:28px 36px;background-color:#0b0f1a;border-radius:12px 12px 0 0"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"><tr>
        <td width="48" valign="middle" style="width:48px;padding-right:12px"><img src="https://theprimemarkets.com/favicon-icon.png" width="38" height="38" alt="The Prime Markets" style="display:block;width:38px;height:38px;border:0;border-radius:6px;background-color:#d4af37"></td>
        <td valign="middle"><span style="font-size:19px;line-height:24px;font-weight:700;color:#ffffff">The Prime Markets</span></td>
      </tr></table></td></tr>
      <tr><td style="padding:40px 36px 32px">
        <h1 style="margin:0 0 10px;font-size:26px;line-height:34px;font-weight:700;color:#1a1612">${escapeHtml(title)}</h1>
        ${paragraphs}
        ${action ? `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;margin-top:12px"><tr><td align="center">${action}</td></tr></table>` : ''}
        ${security}
      </td></tr>
      <tr><td style="padding:20px 36px;background-color:#faf8f5;border-top:1px solid #eee8df;border-radius:0 0 12px 12px"><p style="margin:0;text-align:center;font-size:12px;line-height:19px;color:#8a8175">This is an automated security email from The Prime Markets.</p>${expiry}<p style="margin:5px 0 0;text-align:center;font-size:12px;line-height:19px;color:#8a8175">If you did not request this, you can safely ignore this email.</p></td></tr>
    </table>
    <p style="margin:18px 0 0;text-align:center;font-size:11px;line-height:18px;color:#9a9288">&copy; The Prime Markets. All rights reserved.</p>
  </td></tr></table>
</body></html>`;
}
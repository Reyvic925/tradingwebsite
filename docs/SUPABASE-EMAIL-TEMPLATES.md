# The Prime Markets email templates

Configure these in Supabase Dashboard: **Authentication → Email Templates**. Keep the Resend SMTP sender set to `The Prime Markets <no-reply@yourdomain.com>`.

## Confirm signup — token and confirmation link

Use this template for the website's signup flow. It provides the six-digit token for in-app verification and a secure confirmation-link fallback.

```html
<!doctype html>
<html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Confirm your email</title></head>
<body style="margin:0;padding:0;background:#f2efe9;font-family:Arial,Helvetica,sans-serif;color:#1a1612">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f2efe9;padding:40px 16px"><tr><td align="center">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:580px;background:#ffffff;border:1px solid #e8e0d6;border-radius:12px">
      <tr><td style="background:#0b0f1a;padding:28px 36px;border-radius:12px 12px 0 0">
        <table role="presentation" cellspacing="0" cellpadding="0"><tr>
          <td><img src="https://YOUR-DOMAIN.com/favicon.png" width="220" height="52" alt="The Prime Markets" style="display:block;border:0;object-fit:cover;object-position:center" /></td>
          <td style="padding-left:12px;color:#ffffff;font-size:19px;font-weight:700;letter-spacing:-0.3px">The Prime Markets</td>
        </tr></table>
      </td></tr>
      <tr><td style="padding:40px 36px 32px">
        <h1 style="margin:0 0 8px;color:#1a1612;font-size:26px;font-weight:700;letter-spacing:-0.4px">Confirm your email</h1>
        <p style="margin:0 0 24px;color:#6b6358;font-size:15px;line-height:1.6">You’re almost there. Use the secure code below to verify your account.</p>
        <hr style="border:0;border-top:1px solid #f0ebe4;margin:0 0 24px" />
        <div style="background:#f8f5f0;border:1px solid #e8dfd4;border-radius:8px;padding:20px 24px;text-align:center;margin:0 0 24px"><span style="font-family:'Courier New',monospace;font-size:34px;font-weight:700;letter-spacing:10px;color:#1a1612">{{ .Token }}</span></div>
        <p style="margin:0 0 18px;color:#6b6358;font-size:14px;line-height:1.6;text-align:center">Or confirm instantly using the secure link below.</p>
        <p style="margin:0 0 24px;text-align:center"><a href="{{ .ConfirmationURL }}" style="display:inline-block;background:#d4af37;border-radius:6px;color:#0b0f1a;font-size:15px;font-weight:700;padding:14px 36px;text-decoration:none">Confirm email address</a></p>
        <div style="background:#faf8f5;border-left:3px solid #d4af37;border-radius:6px;padding:16px 20px"><p style="margin:0;color:#6b6358;font-size:13px;line-height:1.6"><strong style="color:#1a1612">Security tip:</strong> Never share this code with anyone. The Prime Markets team will never ask for it.</p></div>
      </td></tr>
      <tr><td style="background:#faf8f5;border-top:1px solid #eee8df;border-radius:0 0 12px 12px;color:#8a8175;font-size:12px;line-height:1.6;padding:18px 36px;text-align:center">Automated security email from The Prime Markets. Please do not reply.<br />This link expires in 24 hours.</td></tr>
    </table>
  </td></tr></table>
</body></html>
```

Replace `YOUR-DOMAIN.com` with the deployed website domain. The supplied `favicon.png` is now the logo used by the website and every email layout.

## Other Supabase Auth templates

Use the same wrapper above for **Invite user**, **Magic link**, **Change email address**, and **Reset password**. Their call-to-action button should use `{{ .ConfirmationURL }}` rather than `{{ .Token }}`. For **Reauthentication**, use the OTP card with `{{ .Token }}`.

For all other link-based templates, use this button inside the content area:

```html
<p><a href="{{ .ConfirmationURL }}" style="display:inline-block;background:#d4af37;border-radius:4px;color:#1a1304;font-weight:700;padding:13px 20px;text-decoration:none">Continue securely</a></p>
```

Do not enable click tracking for Supabase authentication emails: it can rewrite confirmation links and prevent them from working.

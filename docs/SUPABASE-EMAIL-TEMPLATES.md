# The Prime Markets email templates

Configure these in Supabase Dashboard: **Authentication → Email Templates**. Keep the Resend SMTP sender set to `The Prime Markets <no-reply@yourdomain.com>`.

## Confirm signup — OTP

Use this template for the website's six-digit signup screen. It deliberately uses `{{ .Token }}` instead of `{{ .ConfirmationURL }}`.

```html
<!doctype html>
<html><body style="margin:0;background:#f4f1ea;font-family:Arial,Helvetica,sans-serif;color:#211d17">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="padding:32px 12px"><tr><td align="center">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;background:#fff;border:1px solid #e6dfd2;border-radius:8px">
      <tr><td style="background:#090b10;padding:26px 36px;color:#fff;font-size:18px;font-weight:700"><img src="https://YOUR-DOMAIN.com/favicon.svg" width="36" height="36" alt="The Prime Markets" style="vertical-align:middle;border-radius:4px;margin-right:12px" />The Prime Markets</td></tr>
      <tr><td style="padding:36px"><h1 style="margin:0 0 16px;font-size:24px">Confirm your email</h1><p style="color:#61594e;line-height:1.65">Use this code to securely finish creating your account:</p><div style="margin:24px 0;background:#f7f3ea;border:1px solid #e6dfd2;border-radius:6px;color:#211d17;font-family:monospace;font-size:32px;font-weight:700;letter-spacing:8px;padding:18px;text-align:center">{{ .Token }}</div><p style="color:#8a8175;font-size:13px;line-height:1.6">For your security, do not share this code with anyone. The Prime Markets team will never ask for it.</p></td></tr>
      <tr><td style="border-top:1px solid #eee8dd;padding:20px 36px;color:#8a8175;font-size:12px">Automated security email from The Prime Markets. Please do not reply.</td></tr>
    </table>
  </td></tr></table>
</body></html>
```

Replace `YOUR-DOMAIN.com` with the deployed website domain. Do not use an SVG logo URL from a different domain.

## Other Supabase Auth templates

Use the same wrapper above for **Invite user**, **Magic link**, **Change email address**, and **Reset password**. Their call-to-action button should use `{{ .ConfirmationURL }}` rather than `{{ .Token }}`. For **Reauthentication**, use the OTP card with `{{ .Token }}`.

For all link-based templates, use this button inside the content area:

```html
<p><a href="{{ .ConfirmationURL }}" style="display:inline-block;background:#d4af37;border-radius:4px;color:#1a1304;font-weight:700;padding:13px 20px;text-decoration:none">Continue securely</a></p>
```

Do not enable click tracking for Supabase authentication emails: it can rewrite confirmation links and prevent them from working.

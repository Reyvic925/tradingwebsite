# The Prime Markets Email Design

The active website auth provider is the Cloudflare Worker, which sends signup verification, password reset, and account-security emails through Resend. Transactional and deposit-notification emails use the same HTML renderer in `shared/email-template.js`; update that renderer to change the branded layout across these senders.

The renderer follows the supplied confirmation-email design: warm neutral canvas, navy brand header, gold action button, centered 580px table layout, security callout, and a restrained footer. Dynamic text and links are HTML-escaped. Signup emails contain both an 8-digit verification code and a confirmation link; both expire after 10 minutes. Password-reset links expire in 60 minutes.

Signup creates a pending account with no authenticated session. The user must enter the emailed code or confirm through the link before sign-in succeeds. Signup links open `/auth/confirm`, a non-consuming page; verification only occurs after the user clicks **Confirm Email**, which then visits `/api/auth/verify-email`. Keep this two-step behavior so email security scanners cannot consume a token by prefetching the link. Code attempts are rate-limited, and both verification credentials are single-use.

The app does not currently use Supabase-managed auth email templates for signup. If enabling those flows later, configure each template in **Supabase Dashboard → Authentication → Email Templates** and align its token/link variables with the app's confirmation route before switching providers. Avoid using a direct token-consuming verification URL in email links.

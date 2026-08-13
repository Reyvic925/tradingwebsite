Security checklist and admin endpoints hardening

This document describes recommended environment variables, rotation guidance, and admin endpoint hardening implemented in the codebase.

1) Admin auth centralization
- New helper: api-handlers/auth-admin.js
  - Preference: session-based admin checks. If a Bearer token is provided the helper will validate the session with Supabase and prefer profile.role === 'admin' (or user.user_metadata?.is_admin or user.role === 'admin').
  - Fallback: header-based secrets are supported for automation (ADMIN_SECRET and CRON_SECRET). When a header secret is used actions are recorded without an associated user id in audit logs (admin id = null).
  - Rationale: attribute actions to real user accounts when possible; allow non-interactive scripts to authenticate via secrets.

2) Changes made to admin handlers
- Updated to use centralized admin helper (api-handlers/auth-admin.js):
  - api-handlers/admin.js
  - api-handlers/admin-kyc.js
  - api-handlers/admin-crypto-addresses.js
- Decryption endpoints (crypto addresses) now:
  - enforce server-side-only execution (defense-in-depth check)
  - record admin_audit_log entries when secrets (private keys / mnemonics) are revealed, including which fields were revealed and the auth method (session/admin-secret/cron-secret)

3) Environment variable checklist
- Required for production usage (store securely in secret manager, do not commit to source):
  - ADMIN_SECRET - header secret for administrative scripts. Use long, random secret. Prefer storing in a secrets manager or CI/CD environment variables.
  - CRON_SECRET - header secret dedicated for scheduled non-interactive jobs.
  - ENCRYPTION_MASTER_KEY - master key used to encrypt/decrypt sensitive data. Must be rotated carefully (see below).
  - SUPABASE_URL, SUPABASE_KEY (or equivalent) - keep database and auth credentials secure.

4) ENCRYPTION_MASTER_KEY rotation guidance
- High-level approach:
  1. Provision a new master key in your secrets manager.
  2. Deploy application with both old and new keys available (app must be able to decrypt with old or new). Implement or use a key-derivation/versioning scheme if possible.
  3. Re-encrypt stored secrets with the new key. Options:
     - Create a one-time migration script that reads each encrypted value, decrypts with the old key, re-encrypts with the new key, and writes it back. Run this script in maintenance mode.
     - Or adopt envelope encryption where data keys are re-wrapped by new master key without decrypting underlying data keys.
  4. Verify data integrity and application behavior.
  5. Remove the old key from the environment and secrets manager after verification and an appropriate retention window.
- Important notes:
  - Never keep a plaintext backup of the master key in source control or logs.
  - Re-encryption may require downtime or a migration window depending on dataset size; run on a replica or with rate limiting to avoid DB overload.
  - For large datasets, process in batches and include retry/monitoring.

5) Rotating ADMIN_SECRET and CRON_SECRET
- Rolling rotation strategy:
  1. Add the new SECRET value to the environment (app accepts both old and new during transition). For example support ADMIN_SECRET_OLD + ADMIN_SECRET_NEW or check multiple env values.
  2. Update automation (cron jobs, CI) to use the new secret and validate in staging.
  3. After all clients use the new secret, remove the old secret from environment.
- Immediately revoke and rotate if a secret is suspected of disclosure.

6) Rate-limiting and throttling recommendations
- Protect cron and admin endpoints to reduce abuse and accidental leaks:
  - Edge / CDN level: Cloudflare Rate Limiting or equivalent can throttle requests by IP or route.
  - Platform / hosting: Vercel Edge Functions / Edge Middleware can implement rules (block or throttle) before reaching the origin.
  - In-app throttling: implement token-bucket / leaky-bucket per IP or per API key. For admin endpoints prefer stricter rules (very low rate, strict burst controls).
- Specific recommendations for cron endpoints:
  - Only allow cron endpoints to be called from known IP ranges or via signed requests when possible.
  - Use a dedicated CRON_SECRET and rotate regularly.

7) Operational guidance and monitoring
- Enable audit logging and alerts for admin actions (admin_audit_log table entries). Configure monitoring/alerts for unusual patterns (many reveals, repeated failed auth attempts).
- Store audit logs in an append-only location (or export copies to a SIEM) and lock down write permissions.

8) Developer notes
- The codebase now centralizes admin logic in api-handlers/auth-admin.js. When adding new admin endpoints, call requireAdmin(req) and use the returned object to attribute actions to a user when available.

Appendix: quick checklist for deploy
- [ ] Set ADMIN_SECRET, CRON_SECRET, ENCRYPTION_MASTER_KEY in environment/secrets manager
- [ ] Ensure app has a secure runtime to access SUPABASE_KEY and ENCRYPTION_MASTER_KEY
- [ ] Configure rate-limiting on admin routes at the edge (Cloudflare/Vercel) and in-app
- [ ] Run key rotation process if rekeying is required


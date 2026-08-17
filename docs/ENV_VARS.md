Environment Variables (required by server)

This file documents the primary environment variables used by the server and what they are used for. Keep secrets out of source control and only set them in secure deployment environments.

CRON_SECRET
- Purpose: Shared secret used to authenticate requests to cron endpoints (simple HMAC or header check).
- Usage: Set a long random string. The cron endpoint validates the header/secret before processing tick/limit workflows.

ADMIN_SECRET
- Purpose: A shared secret for lightweight admin endpoints (used for manual admin pages or scripts).
- Usage: Set a strong secret and rotate periodically. Admin pages should validate this secret in Authorization or a custom header.

ENCRYPTION_MASTER_KEY
- Purpose: Master secret used to derive the AES-256-GCM key for encrypting sensitive blobs (private keys, mnemonics, etc.).
- Usage: The server derives a 32-byte AES key via SHA-256(ENCRYPTION_MASTER_KEY). Keep this secret in a secure vault. Never expose it to client-side code.

SUPABASE_URL, SUPABASE_KEY (or SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY)
- Purpose: Credentials to connect to Supabase (database + auth). Use service role key for server-only operations that require elevated privileges.
- Usage: Set both values in server environment; prefer using separate keys for client vs server contexts.

RESEND_API_KEY, RESEND_FROM_EMAIL, APP_URL
- Purpose: Send transactional account alerts through Resend. `RESEND_FROM_EMAIL` must use a sender/domain verified in Resend, such as `Apex Prime <no-reply@yourdomain.com>`.
- Usage: Set these only in the server/Vercel environment. Alerts still appear in-app if Resend is not configured or delivery fails.
- Supabase Auth OTP/confirmation: configure the same Resend account under Supabase Dashboard -> Authentication -> SMTP Settings. The website's signup flow uses Supabase Auth, which must retain control of confirmation-token generation and verification.

BLOCKCHAIN_API_KEY
- Purpose: API key for any blockchain node/rpc provider (e.g., Infura, Alchemy, QuickNode) used for on-server deposit generation or chain queries.
- Usage: Keep server-side only. If using provider-specific env names, map them into BLOCKCHAIN_API_KEY or use provider-specific variables.

MARKET_DATA_API_KEY
- Purpose: API key for market-data provider (price feeds, OHLC, orderbook snapshots).
- Usage: Server uses this key to fetch market data for syncing, charting, and ticks.

Notes and Best Practices
- For tests: set ENCRYPTION_MASTER_KEY to a deterministic test value (example in tests: 'test-master-key-please-change-in-prod') so encryption tests can run locally.
- Rotate secrets periodically and store them in a secrets manager (AWS Secrets Manager, Azure Key Vault, Vault, etc.).
- Do not commit any secrets to the repo or attach them to pull-requests.

Environment Variables

Vercel serves the frontend and proxies API requests to the Cloudflare Worker. It does not connect to Supabase. Keep deployment values in the relevant provider's secure environment settings, not in source control.

WORKER_API_URL (required in Vercel Production and Preview)
- Purpose: Base URL of the corresponding deployed Cloudflare Worker, without a trailing slash.
- Usage: The Vercel API entry point forwards every `/api/*` request to this Worker. If it is missing, Vercel returns 503 and does not fall back to legacy database handlers. Use the production Worker URL for Production and the staging Worker URL for Preview.
- Do not set `VITE_WORKER_AUTH_URL` for Vercel; browser auth should remain same-origin so the Vercel proxy can forward the HttpOnly D1 session cookie.

CRON_SECRET
- Purpose: Shared secret used to authenticate requests to cron endpoints (simple HMAC or header check).
- Usage: Set a long random string. The cron endpoint validates the header/secret before processing tick/limit workflows.

ADMIN_SECRET
- Purpose: A shared secret for lightweight admin endpoints (used for manual admin pages or scripts).
- Usage: Set a strong secret and rotate periodically. Admin pages should validate this secret in Authorization or a custom header.

ENCRYPTION_MASTER_KEY
- Purpose: Master secret used to derive the AES-256-GCM key for encrypting sensitive blobs (private keys, mnemonics, etc.).
- Usage: The server derives a 32-byte AES key via SHA-256(ENCRYPTION_MASTER_KEY). Keep this secret in a secure vault. Never expose it to client-side code.

RESEND_API_KEY, RESEND_FROM_EMAIL, APP_URL
- Purpose: Send transactional account alerts through Resend. `RESEND_FROM_EMAIL` must use a sender/domain verified in Resend, such as `Apex Prime <no-reply@yourdomain.com>`.
- Usage: Configure these on the Worker only if its handlers use them. Alerts still appear in-app if email delivery is not configured or fails.

BLOCKCHAIN_API_KEY
- Purpose: API key for any blockchain node/rpc provider (e.g., Infura, Alchemy, QuickNode) used for on-server deposit generation or chain queries.
- Usage: Keep server-side only. If using provider-specific env names, map them into BLOCKCHAIN_API_KEY or use provider-specific variables.

MARKET_DATA_API_KEY
- Purpose: API key for market-data provider (price feeds, OHLC, orderbook snapshots).
- Usage: Server uses this key to fetch market data for syncing, charting, and ticks.

Notes and Best Practices
- Supabase credentials are not required by Vercel. Legacy migration/backfill scripts may still require Supabase credentials when run manually; do not add them to Vercel's environment.
- For tests: set ENCRYPTION_MASTER_KEY to a deterministic test value (example in tests: 'test-master-key-please-change-in-prod') so encryption tests can run locally.
- Rotate secrets periodically and store them in a secrets manager (AWS Secrets Manager, Azure Key Vault, Vault, etc.).
- Do not commit any secrets to the repo or attach them to pull-requests.

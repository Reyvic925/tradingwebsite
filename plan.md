Project Plan — Documentation & Testing Update

Updated: 2026-08-13

Scope:
- Add ENV_VARS documentation
- Add unit tests for deterministic market tickper (applyTick)
- Ensure AES encrypt/decrypt helpers have unit coverage
- Add a lightweight script to run only the new tests

Progress (todos):
- documentation-testing: DONE — added docs/ENV_VARS.md, updated plan.md, added test runner script, added unit tests
- add-applyTick-tests: DONE — new tests/unit/applyTick.test.mjs added covering deterministic behavior under seeded RNG
- crypto-keys-unit-tests: DONE — existing tests/unit/crypto-keys.test.mjs present and will be executed by the run-tests script
- update-package-test-script: SKIPPED — not modified to avoid changing CI semantics
- integration-tests: BLOCKED — requires live Supabase and DB fixtures; cannot run in unit-only environment
- e2e-pages: BLOCKED — requires browser automation environment and seeded test data
- admin-portal: DONE — created dedicated /admin/login and /admin/dashboard with protected routes and admin-only guard
- admin-pages-integration: DONE — KYC review and crypto-address pages now send Authorization headers, support x-admin-secret override, and use the admin shell style

Notes / Rationale:
- applyTick is stochastic (uses Math.random). The unit test seeds Math.random with a deterministic LCG so outputs are repeatable for regression tests.
- AES helpers rely on ENCRYPTION_MASTER_KEY from env. The run-tests.ps1 sets a deterministic test-only master key before executing tests.
- I intentionally did not change package.json or CI scripts to avoid interfering with existing pipelines; the included scripts/run-tests.ps1 is intended for local developer runs.

Recent changes (2026-08-13):
- Wallet UI updated: replaced user-facing "Reveal Keys" and private-key UI with a crypto-only deposit address list. The frontend now calls the server-side handler at /api/deposit-crypto to generate addresses.
- User API decrypt route: verified that api-handlers/user.js does not expose any decrypt endpoint. Decryption functionality remains restricted to admin-only api-handlers/admin-crypto-addresses.js (audited).
- Admin portal created: dedicated /admin/login, /admin/dashboard, /admin/health and protected routes with role checks.
- KYC and crypto-address admin pages now send Authorization and optional x-admin-secret headers and are integrated into the admin shell styling.
- Committed changes and pushed to main branch (commits: 0789ea2d, cc85c5d).

Next steps / verification (recommended):
1. Seed markets (admin-only):
   - curl -X POST "http://localhost:3000/api/admin/seed-markets" -H "X-Admin-Secret: <ADMIN_SECRET>"
   - Or run locally (requires ADMIN_SECRET env): ADMIN_SECRET=<ADMIN_SECRET> node scripts/verify-seed.js --direct
2. Run a cron tick to write price history:
   - curl -X POST "http://localhost:3000/api/cron/tick" -H "X-Cron-Secret: <CRON_SECRET>"
   - Or use the integration helper: node scripts/integration.js (requires envs listed in scripts)
3. Verify deposit address generation and listing:
   - As an authenticated user POST /api/deposit-crypto with JSON { "currency": "USDT" } and Authorization: Bearer <user_token>. Expect 200 { "address": "..." }.
   - Then GET /api/user/crypto-addresses (authenticated) to confirm the saved address is returned (id, currency, address, created_at, last_used_at).
4. SQL counts (optional):
   - SELECT COUNT(*) FROM markets;
   - SELECT COUNT(*) FROM price_history;
   - SELECT COUNT(*) FROM crypto_addresses;

If any blocked items should be unblocked, add required test environment variables and fixtures and re-run the full-suite tests.

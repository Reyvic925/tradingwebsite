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

Notes / Rationale:
- applyTick is stochastic (uses Math.random). The unit test seeds Math.random with a deterministic LCG so outputs are repeatable for regression tests.
- AES helpers rely on ENCRYPTION_MASTER_KEY from env. The run-tests.ps1 sets a deterministic test-only master key before executing tests.
- I intentionally did not change package.json or CI scripts to avoid interfering with existing pipelines; the included scripts/run-tests.ps1 is intended for local developer runs.

Next steps:
1. Add CI job that runs the new tests during pull-request validation (optional): run the run-tests.ps1 in a Windows job or invoke the node test files directly on Linux, ensuring ENCRYPTION_MASTER_KEY is set.
2. Add integration tests with Supabase test fixtures and mock blockchain providers — requires test DB and credentials.
3. Expand applyTick coverage to include edge-cases (very low prices, missing fields) and add snapshot assertions for more robust regressions.
4. Add documentation pages for new endpoints (cron, admin, kyc, deposit, charts, crypto admin) as the API stabilizes.

If any of the blocked items should be unblocked, add the required test environment variables and fixtures and re-run the full-suite tests.

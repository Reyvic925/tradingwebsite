# Copy trading upgrade

The Worker now owns `/api/copy-trades`, `/api/copy-summary`, `/api/copy-activity`,
`/api/leaderboard`, and `/api/trader-comparison`. Apply `0020_copy_trading.sql`
before deploying the new Worker and assets. Existing Supabase follow records
are not imported by this additive D1 migration.

## Behavior

- Directory and trader profiles share one allocation/risk review modal.
- The existing USD wallet funds allocations. No separate paper balance or new
  simulation labels were introduced.
- Wallet reservation and release happen through transactional SQLite triggers.
  Duplicate starts roll back reservations; stopping is idempotent.
- Copy positions have fixed quantities until exit. Multiplier edits affect
  future entries. A new copy waits for the strategy's next entry.
- Pause blocks new entries. Existing positions still mark to market, close
  normally, and remain subject to risk limits.
- Drawdown is measured from the copy's highest net equity. Profit targets are
  measured from its allocation. Stops execute on scheduled valuations and can
  overshoot their trigger. Closing exits at the latest processed mark with
  execution costs; it does not promise a trigger-price fill.
- Performance fees apply only to net profits above the previous post-fee high.
  Activity records reconcile gross change minus fees to net change; exits also
  record the position's complete realized P&L after fees.
- Five-minute ticks use shared seeded market shocks, persistent regimes,
  correlated assets, prior-tick strategy signals, multi-tick positions, spreads,
  slippage, commission, and position stops. Session hours follow the existing
  UI's UTC schedule. Prices are generated, not external market quotes.
- Scheduled retries use unique event IDs and optimistic revisions. Per-tick
  processing details are retained for two days; account activity and daily
  history remain. Missed ticks do not create retrospective entries.
- 30/90-day comparisons require records covering both period endpoints.
  Drawdown comparisons use daily closing snapshots; card drawdown also captures
  intraday scheduled valuations. Charts use shared dates indexed to 100.

## Validation and rollout

```
npm test
npm run build
npx wrangler d1 migrations list apex-prime-db --remote
npx wrangler d1 migrations apply apex-prime-db --remote
npm run cf:deploy
```

`tests/unit/d1-copy-trading.test.mjs` runs the migration and Worker SQL against
SQLite and exercises reservation rollback, duplicate ticks, real copied
positions, pause/resume, drawdown settlement, authorization, fee high-water
marks, and short/full-history comparisons.

If rolling back the Worker, preserve the new tables and triggers. Do not drop
copy balances or activity. Close outstanding copies through the current API
before removing their backend support.

# Synthetic trader simulation

## Data flow

`trader configuration -> deterministic market movement -> strategy decision -> synthetic trade -> equity snapshot -> derived metrics -> copier update -> API -> UI`

The `traders` table remains the public projection. Persistent simulation inputs and state live in `trader_simulation_state`. Trades are keyed by `event_id`; equity snapshots are keyed by `(trader_id, tick_index)`.

## Database rollout

Run these SQL files in order:

1. `20260816-copy-trading-schema.sql`
2. `20260912-synthetic-trader-simulation.sql`
3. `20260912-synthetic-trader-simulation-rpc.sql`

Then run:

```text
npm run traders:migrate
npm run traders:rebuild-metrics
npm run audit:traders
```

The migration preserves trader identity and moves existing performance numbers into `targetReturnProfile` configuration only. It resets the public projection to the configured starting equity and rebuilds performance from synthetic events.

## Cron

Vercel runs `/api/cron/traders` every five minutes. `/api/cron-copy-trading` and `/api/simulate` now route to the same deterministic handler for compatibility.

Each invocation:

1. Reads persistent state.
2. Replays missed five-minute intervals, bounded to 288 ticks.
3. Claims `trader_id:tick_index` in `synthetic_ticks`.
4. Generates correlated synthetic prices and a strategy-specific trade.
5. Calculates P&L from side, quantity, entry, and exit prices.
6. Stores the trade and equity snapshot.
7. Recalculates metrics from stored rows.
8. Updates active copiers from the trader equity change.

Duplicate claims are skipped. If a prior attempt already stored equity before/after values, copier updates are replayed without creating another trade.

## Recovery

- `npm run traders:rebuild-metrics` regenerates public metrics from synthetic trades and snapshots.
- `npm run audit:traders` reports stored/calculated differences and never overwrites them.

## Example

For a starting equity of `$100,000`, a BUY with quantity `2`, entry `$100`, and exit `$110` has P&L `$20`. Equity becomes `$100,020`, and ROI is derived as `0.02%`. No separate ROI input is used by the simulator.

## Known operational limitation

The SQL migrations must be applied in Supabase before the new cron route can run. The repository cannot execute arbitrary Supabase DDL through the REST client. Until that rollout is completed, the existing database remains on the legacy schema and the reconciliation command reports the missing `synthetic_ticks` table.

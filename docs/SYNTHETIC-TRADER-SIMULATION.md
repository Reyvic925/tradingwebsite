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

## Target win-rate profiles (opt-in)

Individual modelled profiles can opt into a target win rate. This is a policy inside the model, not a rewrite of reported numbers: every closed trade still carries the P&L from its entry, exit, size, and fees, and the public win rate is derived from those rows.

The live D1 copy-trading worker reads this config from `copy_simulation_state.config` and calls the same simulator. Apply it to a selected list of traders:

```text
npm run traders:set-performance-targets -- --top 9 --dry-run
npm run traders:set-performance-targets -- --names "Mark Hergott,Emiliano Arriaga" --win-rate 0.9
npm run traders:set-performance-targets -- --ids 1,2,3 --win-rate 0.9
```

`0040_target_win_rate_top_traders.sql` and `0042_align_live_win_rate_barriers.sql` are the checked-in migrations for the nine highest-return active traders. The script uses your local Wrangler session and only edits `copy_simulation_state.config` via `json_set`, preserving every other field. State, quote provenance, and equity history are untouched by these migrations; refreshed metrics appear on the next copy-trading tick. For the Supabase path, the equivalent field lives in `trader_simulation_state.config`. Relevant config fields:

- `enforceTargetWinRate` — enables the policy (default `false`; legacy profiles are unchanged).
- `targetWinRate` — intended hit rate, capped at 0.95.
- `directionBias` — probability of the strategy's directional edge; the calibrated profiles use `0.99`.
- `takeProfitVolatilityRatio` / `stopLossVolatilityRatio` — exit barriers expressed in multiples of the asset's volatility. The live calibrated values are `0.3` and `2.7`.
- `maxHoldingTicks` — maximum position age before a time exit (default `96`).
- `driftMultiplier` — opt-in regime assumption used only by the backfill (default `1`, so live ticks are unchanged).

The policy works on both synthetic and quote-backed paths. The take-profit/stop-loss levels are only close *triggers* — the executed exit price is always the current provider quote (or synthetic price), so quote provenance and audit rows remain valid. A high hit rate is achieved with many small wins and fewer large losses, so it does not imply a high profit factor on its own; `targetReturnProfile` remains the configured return baseline described above.

## Modelled strategy history (backfill)

`0041_modelled_trader_history.sql` adds a `modelled` flag to `trader_history` and `trader_trades` so generated rows can be distinguished from live ticks. The profile API exposes a `performance` block computed entirely from those stored rows: closed trades, win rate, profit factor, expectancy, average win/loss, streaks, max drawdown, months active, and strategy return. The profile UI labels these panels **Modelled strategy history**.

`npm run traders:build-modelled-history` regenerates the series for the top nine active traders. It is deterministic (seeded by trader/tick/strategy) and supports `--days`, `--ids`, `--top`, `--drift`, `--bias`, `--tp`, `--sl`, `--dry-run`, and `--apply`. It replaces that trader's prior simulated trade log and equity snapshots with the modelled series; no user, wallet, follow, or copy-event data is touched. The default run is a two-year daily history with a documented favourable-drift assumption (`--drift 4`) and tighter daily barriers. Always run `--dry-run` first and review the printed per-trader win rate, return, and drawdown before `--apply`.

## Recovery

- `npm run traders:rebuild-metrics` regenerates public metrics from synthetic trades and snapshots.
- `npm run audit:traders` reports stored/calculated differences and never overwrites them.

## Example

For a starting equity of `$100,000`, a BUY with quantity `2`, entry `$100`, and exit `$110` has P&L `$20`. Equity becomes `$100,020`, and ROI is derived as `0.02%`. No separate ROI input is used by the simulator.

## Known operational limitation

The SQL migrations must be applied in Supabase before the new cron route can run. The repository cannot execute arbitrary Supabase DDL through the REST client. Until that rollout is completed, the existing database remains on the legacy schema and the reconciliation command reports the missing `synthetic_ticks` table.

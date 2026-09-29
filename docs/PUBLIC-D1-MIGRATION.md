# Public Supabase to D1 Mapping

This migration is limited to the read-only data consumed by `/api/landing` and `/api/markets`.
It does not read users, profiles, wallets, balances, orders, positions, traders, trades, deposits, withdrawals, KYC, admin, or other private data.

## Landing

The Supabase handler currently uses `select('*')` and orders by `id`. The export utility makes the projection explicit:

| Supabase table | Columns | D1 table | Conversion |
| --- | --- | --- | --- |
| `features` | `id`, `title`, `description`, `icon` | `features` | `serial` to integer; text unchanged; null preserved |
| `partners` | `id`, `name`, `mark` | `partners` | `serial` to integer; text unchanged; null preserved |
| `platform_stats` | `id`, `label`, `value`, `suffix`, `prefix` | `platform_stats` | `numeric` to finite SQLite REAL; text/null preserved |
| `plans` | `id`, `name`, `tagline`, `min_amount`, `max_amount`, `daily_rate`, `duration_days`, `total_return`, `featured` | `plans` | numeric values to finite SQLite REAL; duration to safe integer; PostgreSQL boolean to `0/1` |
| `testimonials` | `id`, `name`, `country`, `amount`, `quote`, `video_url`, `avatar_url`, `role` | `testimonials` | `serial` to integer; amount to finite SQLite REAL; text/null preserved |

No landing timestamps are returned or required by the current handler.

## Markets

The Supabase handler queries `markets` with `select('*')`, filters/orders/pages the rows, and returns the row fields plus a `debug` object. The approved export projection contains the public fields used by the Worker response:

| Supabase table | Columns | D1 table | Conversion |
| --- | --- | --- | --- |
| `markets` | `id`, `symbol`, `name`, `asset_class`, `price`, `change_24h`, `volume`, `high_24h`, `low_24h` | `markets` | `serial` to integer; numeric values to finite SQLite REAL; text/null preserved |

`hidden_drift` and `volatility` are used by the old Supabase cron implementation, not by the public read response, and are excluded. Live Binance/Yahoo values are runtime responses, not source-table data, and are excluded. The Worker response intentionally remains `{ items, total, limit, offset }` without the legacy `debug` field.

## Safe Utility

Export requires the existing server-side Supabase variables and never falls back to the local dev store:

```powershell
node scripts/migrate-public-read-data.mjs --export tmp/apex-prime-public-data.json
```

Import is restricted to `apex-prime-staging`, validates all columns/types, writes a deterministic transaction, and does nothing unless `--apply` is present:

```powershell
node scripts/migrate-public-read-data.mjs --import tmp/apex-prime-public-data.json --database apex-prime-staging
node scripts/migrate-public-read-data.mjs --import tmp/apex-prime-public-data.json --database apex-prime-staging --apply
```

The second command has intentionally not been run. The utility deletes and replaces only the six approved public tables in staging, so reruns do not duplicate rows. No production import command is supported.
# Market symbol audit — November 13, 2026

Audited all 1,949 production catalog entries, plus five missing major stocks proposed for restoration. The machine-readable evidence for every symbol is in [audit.json](audit.json); totals are in [summary.json](summary.json).

| Result | Count | Action |
| --- | ---: | --- |
| Provider and TradingView verified, supported by current settlement setup | 811 | Selectable and eligible for fresh-quote execution |
| Provider and TradingView verified, native currency unsupported for settlement | 509 | Keep visible, display currency, quotes only |
| Fabricated stock symbols from `EXTRA_STOCKS` | 540 | Exclude from selection and new orders; remove generator |
| No active current-provider listing or no usable provider quote | 83 | Exclude pending supported-provider verification |
| Provider quotes over ten days old | 9 | Exclude pending listing review |
| Provider found, TradingView identifier not verified | 2 | Exclude pending chart verification |

The last three groups are not automatically fictitious. They include real assets, obsolete codes and provider-specific limitations. A failed provider request is not proof that a company or asset is fake. The two unresolved chart entries are `1COV.DE` and `ROKU`.

The five restoration entries are `AAPL`, `MSFT`, `NVDA`, `AMZN`, and `TSLA`. Migration `0022_restore_verified_core_markets.sql` inserts them only if absent, with no seeded price. It is idempotent. Until applied, the revised production catalog would contain 1,315 selectable rows instead of 1,320.

Verification used Coinbase's active USD product catalog, Gold API spot metal endpoints, Yahoo chart metadata and TradingView's public global scanner. Exact TradingView exchange identifiers were checked in batches, including `NYSE:KO`, `NASDAQ:AAPL`, `COINBASE:BTCUSD`, and `COMEX:GC1!`. Foreign exchange suffixes and share-class punctuation were resolved against actual scanner responses. Quotes retain provider timestamps; cached/historical values are not presented as new ticks.

The application now shares an audited registry across API filtering, order eligibility, seeds, provider symbol mapping and chart mapping. A registry exclusion removes a symbol from active selection without deleting market IDs, historical trades, positions, fills or watchlist references. Previously queued orders for excluded symbols do not execute automatically. Existing positions are retained for explicit resolution.

Real international listings remain visible in their native currency. `GBp` means British pence and is not relabeled as pounds or dollars. New orders in markets requiring unsupported settlement are rejected. Quotes-only does not mean fictitious. Provider quotes may be delayed; this audit does not establish a consolidated real-time exchange feed or brokerage execution support.

To repeat: export `SELECT id, symbol, name, asset_class FROM markets ORDER BY symbol` using Wrangler's JSON output, normalize its `results` to `tmp/market-catalog-input.json`, run `node scripts/audit-market-catalog.mjs --refresh`, then `node scripts/build-verified-market-catalog.mjs`. Review exclusions before releasing the generated registry. Without `--refresh`, the audit resumes saved provider evidence and repeats TradingView verification.

No production deployment, catalog deletion or restoration migration is performed by either audit script.

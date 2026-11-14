# Advanced paper-trading upgrade

Implementation scope authorized in this conversation. Production release requires review after the complete implementation and validation.

- [x] Authoritative portfolio valuation independent of market browser; isolate quote failures.
- [x] Instrument multipliers, quantity/tick rules, FX conversion, preserved legacy valuations.
- [x] Idempotent submission and concurrency-safe fills and settlements.
- [x] Exchange sessions, clocks, next-open/close, holiday and early-close calendars; DAY/GTC/GTD expiry.
- [x] Partial closes, reduce-only orders, amendments, linked SL/TP exits and trailing stops.
- [x] Risk/cash sizing, order previews, collateral, fees and risk/reward.
- [x] Separate catalog/quote/portfolio loading, debounced search and cached discovery.
- [x] Authenticated live account updates and faster background execution checks.
- [x] Real crypto depth; clear absence of depth for other feeds.
- [x] Watchlist tab, saved/resizable layout, chart fullscreen, guarded keyboard shortcuts.
- [x] Integrated execution chart with actual prices and draggable entry/SL/TP; preserve analysis chart.
- [x] Alerts, fill notifications, journal notes, fill history and performance statistics.
- [x] Clear paper-trading, provider-delay, stale, session and quotes-only states.
- [x] Behavioral tests, build, delivery package and deployment review.

Free delayed feeds remain delayed. No real brokerage execution is implied. Session definitions must identify their coverage and pause execution where a required contract calendar or currency conversion cannot be verified. Existing ledger history must not be silently revalued using new contract sizes.

## Execution and timing

The server owns account marks, collateral and settlement. A per-account Cloudflare Durable Object checks active sessions approximately every 5 seconds, with 30-second checks during closed sessions and no alarms when idle. WebSocket snapshots update the terminal; polling is a fallback. These are target check intervals, not guaranteed execution latency. Order history separates request-to-fill elapsed time from provider quote age and data delay.

Crypto operates continuously. US equities use New York regular hours (09:30?16:00), published 2026?2028 holidays and early closes. FX uses Sunday 17:00 through Friday 17:00 New York. Supported Globex references use the daily 17:00?18:00 break and pause on holiday or review dates where shortened contract hours are not verified. Unknown calendars, dates beyond coverage and missing currency conversions pause execution. Foreign exchanges retain their exchange timezones but remain quote-only until calendars are verified. DAY expires at the next eligible session close; GTD uses the selected timezone; GTC persists until cancellation.

Calendars: [NYSE](https://www.nyse.com/trade/hours-calendars), [CME](https://www.cmegroup.com/trading-hours.html).

## Model and limits

This is full-collateral paper trading, with optional simulated commission. There is no broker routing, guaranteed stop price, financing or tax model. Continuous futures are reference symbols rather than dated deliverable contracts. Free delayed feeds remain delayed; no synthetic book or historical candles fill provider gaps. Coinbase increment metadata governs crypto precision. Existing positions preserve their original valuation model; new contract multipliers do not silently rewrite old positions.

Active accounts are bounded to 100 working orders, 100 new open positions and 20 active alerts. Existing positions remain visible. A continuously active 5-second account can schedule about 17,280 alarm checks per day. Providers are free sources; Cloudflare infrastructure usage is not guaranteed to be free.

## Validation and deployment

Behavioral tests cover idempotency, concurrent fills, partial settlement, fees, quote failures, expiry, DST, calendars, contract sizing, live tickets and scheduling. Local browser QA uses clearly labelled fixtures and never submits production orders.

Release sequence after approval:
1. Apply additive D1 migration `0023_advanced_paper_trading.sql`.
2. Deploy the Worker, including the new SQLite Durable Object `TradingEngine` binding and migration.
3. Publish the frontend through the existing GitHub/Vercel flow and verify authenticated account updates.

The new API requires submission IDs; users with the previous frontend open must reload. A short-lived, single-use live ticket connects directly to the Worker across the frontend domain. No production deployment or migration is part of local validation.

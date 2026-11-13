# Market quotes

The Cloudflare Worker uses `worker/market-quotes.js` for market lists, the landing ticker, paper order fills, position marks, and legacy market order/close prices. No API keys or new migrations are required.

- Crypto: Coinbase Exchange public USD product ticker, with the last-trade timestamp. Only products listed on Coinbase are supported.
- Spot gold, silver, platinum, palladium: Gold API, USD per troy ounce, with its provider update timestamp. These are not substituted with futures prices.
- US equities, ETFs, FX, supported futures and indices: Yahoo Finance chart endpoint, with `regularMarketTime`. Quotes can be delayed. The public endpoint is unofficial and can throttle or change.

Prepared fallback for Yahoo failures: TradingView's public scanner, using the audited exchange identifier and `close|1`/`time|1` minute-bar fields. The provider's `update_mode` determines the displayed delay (for example, 15 minutes for NASDAQ). Minute-bar opening times are retained as conservative timestamps; HTTP retrieval time is never substituted for market time. Missing timestamps or unknown delay modes reject the fallback. Yahoo HTTP 429 responses trigger a 60-second retry cooldown in the Worker isolate. Fallback quotes share the usual cache and stale-quote execution checks. This is an unofficial endpoint without an availability guarantee, not a consolidated streaming feed.

Prices are used exactly as returned. Missing change, volume, or high/low fields stay null. Unsupported symbols and provider failures show unavailable instead of seeded prices. Verified international listings display their native currency and are quotes-only until currency settlement is supported; conversion to USD is not implemented. See `market-catalog/README.md` for the full symbol audit and eligibility rules.

Successful quotes are cached for 15 seconds in memory and at the Cloudflare edge; metals use 30 seconds. Concurrent requests within an isolate are shared. Market pages contain at most 12 symbols to stay within free Worker subrequest limits. The UI polls every 30 seconds. This is polled market data, not a streaming execution feed.

Paper and legacy market execution reject missing quotes and quotes older than 90 seconds for Coinbase or 20 minutes for other providers. This also prevents execution using old closing prices outside market hours. Existing pending orders wait; new market orders return 503 without creating an order. Quote source and time are recorded by the paper ledger. Legacy open-position reads label any retained mark when a provider is unavailable.

TradingView charts remain independent embedded feeds; their exchange or timing may differ. The order-book preview remains simulated.

Verification: `npm test` includes provider parsing, concurrent request sharing, exact price use, stale/invalid quotes, outage behavior, market API integration and paper fills. `npm run build` checks the client bundle. Provider availability still needs monitoring after deployment.

Provider references: https://docs.cdp.coinbase.com/api-reference/exchange-api/rest-api/products/get-product-ticker, https://gold-api.com/docs, https://help.yahoo.com/kb/finance/article-exchanges-data-delays-sln2310.html.

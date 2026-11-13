import assert from 'node:assert/strict';
import { clearQuoteCache, getMarketQuote, quoteMarkets } from '../../worker/market-quotes.js';

const originalFetch = globalThis.fetch;
let yahooCalls = 0, fallbackCalls = 0;
let missingTime = false, failFallback = false;
const barTime = Math.floor((Date.now() - 15 * 60000) / 60000) * 60;
globalThis.fetch = async (url, options) => {
  if (String(url).includes('yahoo.com')) { yahooCalls++; return new Response('', { status: 429 }); }
  assert.equal(String(url), 'https://scanner.tradingview.com/global/scan');
  fallbackCalls++;
  if (failFallback) return new Response('', { status: 503 });
  const request = JSON.parse(options.body);
  assert.deepEqual(request.columns.slice(0, 3), ['close|1', 'time|1', 'update_mode']);
  return Response.json({ data: [{ s: request.symbols.tickers[0],
    d: [162.8201, missingTime ? null : barTime, 'delayed_streaming_900', 'USD', -2, 170, 158.39, 361609549] }] });
};
try {
  clearQuoteCache();
  const market = { symbol: 'NVDA', asset_class: 'stock', price: 999 };
  const quote = await getMarketQuote(market, { forTrading: true });
  assert.equal(quote.price, 162.8201, 'use the exact fallback price, not seeded data');
  assert.equal(quote.quote_updated_at, new Date(barTime * 1000).toISOString());
  assert.equal(quote.quote_timestamp_kind, 'minute_bar');
  assert.equal(quote.quote_delay_seconds, 900);
  assert.match(quote.price_source, /15m delayed; 1m bars/);
  assert.equal(quote.quote_stale, false);
  assert.equal(yahooCalls, 1);
  assert.equal(fallbackCalls, 1);
  assert.equal((await getMarketQuote(market)).price, quote.price);
  assert.equal(fallbackCalls, 1, 'cache successful fallback quotes');
  await getMarketQuote({ symbol: 'MSFT', asset_class: 'stock' });
  assert.equal(yahooCalls, 1, 'honor Yahoo cooldown instead of repeatedly hitting 429');

  clearQuoteCache();
  missingTime = true;
  assert.equal(await getMarketQuote(market), null, 'do not invent a timestamp when the fallback lacks one');
  await assert.rejects(getMarketQuote(market, { forTrading: true }), /fresh provider quote/);

  clearQuoteCache();
  failFallback = true;
  const unavailable = (await quoteMarkets([market]))[0];
  assert.equal(unavailable.price, null);
  assert.equal(unavailable.quote_currency, 'USD', 'retain catalog metadata during a provider outage');
  console.log('MARKET_FALLBACK_TESTS_PASSED');
} finally { globalThis.fetch = originalFetch; clearQuoteCache(); }

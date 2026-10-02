import assert from 'node:assert/strict';
import { getLiveMarketQuote } from '../../worker/market-quotes.js';

const originalFetch = globalThis.fetch;
let calls = 0;
let unavailable = true;
globalThis.fetch = async (url) => {
  calls += 1;
  assert.match(url, /api\.coingecko\.com\/api\/v3\/coins\/markets/);
  if (unavailable) return new Response('unavailable', { status: 503 });
  return Response.json([{
    current_price: 84729,
    price_change_percentage_24h: 1.55,
    high_24h: 85183,
    low_24h: 83182,
    total_volume: 33406676411,
    last_updated: '2026-10-02T00:30:20.000Z',
  }]);
};

assert.equal(await getLiveMarketQuote('ETHUSD'), null);
await assert.rejects(getLiveMarketQuote('BTCUSD'), /CoinGecko request failed \(503\)/);
unavailable = false;
calls = 0;
const quote = await getLiveMarketQuote('btcusd');
assert.deepEqual(quote, {
  symbol: 'BTCUSD',
  price: 84729,
  change_24h: 1.55,
  high_24h: 85183,
  low_24h: 83182,
  volume: 33406676411,
  price_source: 'CoinGecko',
  quote_updated_at: '2026-10-02T00:30:20.000Z',
});
assert.deepEqual(await getLiveMarketQuote('BTCUSD'), quote);
assert.equal(calls, 1, 'recent BTC quotes should use the short cache');

globalThis.fetch = originalFetch;
console.log('WORKER_MARKET_QUOTES_TESTS_PASSED');
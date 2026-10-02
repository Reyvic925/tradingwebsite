import assert from 'node:assert/strict';
import { getLiveMarketQuote } from '../../worker/market-quotes.js';

const originalFetch = globalThis.fetch;
let calls = 0;
let unavailable = true;
globalThis.fetch = async (url) => {
  calls += 1;
  assert.match(url, /api\.coinpaprika\.com\/v1\/tickers\/btc-bitcoin/);
  if (unavailable) return new Response('unavailable', { status: 503 });
  return Response.json({
    quotes: { USD: {
      price: 84662.5486610824,
      percent_change_24h: 1.42,
      volume_24h: 26016114241.4,
    } },
    last_updated: '2026-10-02T00:30:20.000Z',
  });
};

assert.equal(await getLiveMarketQuote('ETHUSD'), null);
await assert.rejects(getLiveMarketQuote('BTCUSD'), /CoinGecko request failed \(503\)/);
unavailable = false;
calls = 0;
const quote = await getLiveMarketQuote('btcusd');
assert.deepEqual(quote, {
  symbol: 'BTCUSD',
  price: 84662.5486610824,
  change_24h: 1.42,
  high_24h: null,
  low_24h: null,
  volume: 26016114241.4,
  price_source: 'CoinPaprika',
  quote_updated_at: '2026-10-02T00:30:20.000Z',
});
assert.deepEqual(await getLiveMarketQuote('BTCUSD'), quote);
assert.equal(calls, 1, 'recent BTC quotes should use the short cache');

globalThis.fetch = originalFetch;
console.log('WORKER_MARKET_QUOTES_TESTS_PASSED');
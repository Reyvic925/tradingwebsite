import assert from 'node:assert/strict';
import { getLiveMarketQuote } from '../../worker/market-quotes.js';

const originalFetch = globalThis.fetch;
let calls = 0;
let behavior = 'unavailable';
globalThis.fetch = async (url) => {
  calls += 1;
  if (url.includes('api.coinpaprika.com')) {
    if (behavior !== 'paprika') return new Response('unavailable', { status: 503 });
    return Response.json({
      quotes: { USD: { price: 84662.5486610824, percent_change_24h: 1.42, volume_24h: 26016114241.4 } },
      last_updated: '2026-10-02T00:30:20.000Z',
    });
  }
  assert.match(url, /query2\.finance\.yahoo\.com\/v8\/finance\/chart\/BTC-USD/);
  if (behavior === 'unavailable') return new Response('unavailable', { status: 503 });
  return Response.json({ chart: { result: [{
    meta: { regularMarketPrice: 84858.8, chartPreviousClose: 84000, regularMarketTime: Date.parse('2026-10-02T00:43:16Z') / 1000 },
    indicators: { quote: [{ high: [85183, 85200, null], low: [83182, 83000, null], volume: [120, null] }] },
  }] } });
};

assert.equal(await getLiveMarketQuote('ETHUSD'), null);
await assert.rejects(getLiveMarketQuote('BTCUSD'), /Live BTC quote unavailable/);
behavior = 'yahoo';
calls = 0;
const quote = await getLiveMarketQuote('btcusd');
assert.deepEqual(quote, {
  symbol: 'BTCUSD',
  price: 84858.8,
  change_24h: ((84858.8 / 84000) - 1) * 100,
  high_24h: 85200,
  low_24h: 83000,
  volume: 120,
  price_source: 'Yahoo Finance (CCC)',
  quote_updated_at: '2026-10-02T00:43:16.000Z',
});
assert.deepEqual(await getLiveMarketQuote('BTCUSD'), quote);
assert.equal(calls, 2, 'primary and fallback feeds should be queried once before cache reuse');

globalThis.fetch = originalFetch;
console.log('WORKER_MARKET_QUOTES_TESTS_PASSED');
import assert from 'node:assert/strict';
import { getLiveMarketQuote, refreshMarketPrices } from '../../worker/market-quotes.js';

const originalFetch = globalThis.fetch;
let calls = 0;
let behavior = 'unavailable';
let quoteUpdatedAt;
const requestedUrls = [];
let logicalNow = Date.now();
const originalDateNow = Date.now;
Date.now = () => logicalNow;
globalThis.fetch = async (url) => {
  calls += 1;
  requestedUrls.push(url);
  if (url.includes('api.coinpaprika.com')) {
    if (behavior !== 'paprika') return new Response('unavailable', { status: 503 });
    return Response.json({
      quotes: { USD: { price: 84662.5486610824, percent_change_24h: 1.42, volume_24h: 26016114241.4 } },
      last_updated: quoteUpdatedAt || new Date(logicalNow).toISOString(),
    });
  }
  const yahooSymbol = decodeURIComponent(url.match(/\/chart\/([^?]+)/)?.[1] || '');
  if (behavior === 'unavailable') return new Response('unavailable', { status: 503 });
  const quoteBySymbol = {
    'BTC-USD': { price: 84858.8, previousClose: 84000, exchange: 'CCC' },
    'EURUSD=X': { price: 1.08, previousClose: 1.07, exchange: 'CCY' },
    'ETH-USD': { price: 3000, previousClose: 2900, exchange: 'CCC' },
  };
  const ticker = quoteBySymbol[yahooSymbol];
  if (!ticker) return new Response('symbol not found', { status: 404 });
  return Response.json({ chart: { result: [{
    meta: { regularMarketPrice: ticker.price, chartPreviousClose: ticker.previousClose, exchangeName: ticker.exchange, regularMarketTime: Date.parse(quoteUpdatedAt || new Date(logicalNow).toISOString()) / 1000 },
    indicators: { quote: [{ high: [85183, 85200, null], low: [83182, 83000, null], volume: [120, null] }] },
  }] } });
};

await assert.rejects(getLiveMarketQuote('BTCUSD'), /Live BTCUSD quote unavailable/);
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
  quote_updated_at: new Date(logicalNow).toISOString(),
});
assert.deepEqual(await getLiveMarketQuote('BTCUSD'), quote);
assert.equal(calls, 2, 'primary and fallback feeds should be queried once before cache reuse');

logicalNow += 6000;
quoteUpdatedAt = new Date(logicalNow).toISOString();
const fxQuote = await getLiveMarketQuote('EURUSD');
assert.equal(fxQuote.price, 1.08);
assert.equal(fxQuote.price_source, 'Yahoo Finance (CCY)');
assert.ok(requestedUrls.some((url) => url.includes('/chart/EURUSD%3DX')));

const cryptoQuote = await getLiveMarketQuote('ETHUSD');
assert.equal(cryptoQuote.price, 3000);
assert.equal(cryptoQuote.price_source, 'Yahoo Finance (CCC)');
assert.ok(requestedUrls.some((url) => url.includes('/chart/ETH-USD')));

class FakeMarketDatabase {
  statements = [];
  rows = [
    { id: 1, symbol: 'BTCUSD' },
    { id: 2, symbol: 'ETHUSD' },
    { id: 3, symbol: 'ZZZFAKE' },
  ];

  prepare(sql) {
    const statement = {
      sql,
      values: [],
      bind: (...values) => {
        statement.values = values;
        return statement;
      },
      first: async () => ({ total: this.rows.length }),
      all: async () => ({ results: this.rows }),
    };
    this.statements.push(statement);
    return statement;
  }

  async batch(statements) {
    this.updates = statements;
    return statements.map(() => ({ success: true }));
  }
}

logicalNow += 6000;
quoteUpdatedAt = new Date(logicalNow).toISOString();
const db = new FakeMarketDatabase();
const refreshResult = await refreshMarketPrices(db, logicalNow);
assert.deepEqual(refreshResult, { refreshed: 2, total: 3 });
assert.equal(db.updates.length, 2, 'only symbols with valid live quotes should be persisted');
assert.deepEqual(db.updates[0].values, [84858.8, ((84858.8 / 84000) - 1) * 100, 120, 85200, 83000, 1]);
assert.match(db.updates[0].sql, /UPDATE markets\s+SET price = \?, change_24h = \?, volume = \?, high_24h = \?, low_24h = \?/);

logicalNow += 6000;
quoteUpdatedAt = new Date(logicalNow - 6 * 60 * 1000).toISOString();
await assert.rejects(getLiveMarketQuote('ETHUSD'), /ETHUSD quote is stale/);

globalThis.fetch = originalFetch;
Date.now = originalDateNow;
console.log('WORKER_MARKET_QUOTES_TESTS_PASSED');
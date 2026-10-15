import assert from 'node:assert/strict';
import { getLiveMarketQuote } from '../../worker/market-quotes.js';

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
  const requestUrl = String(url);
  requestedUrls.push(requestUrl);
  if (requestUrl.includes('api.coinpaprika.com')) {
    if (behavior !== 'paprika') return new Response('unavailable', { status: 503 });
    return Response.json({
      quotes: { USD: { price: 84662.5486610824, percent_change_24h: 1.42, volume_24h: 26016114241.4 } },
      last_updated: quoteUpdatedAt || new Date(logicalNow).toISOString(),
    });
  }
  if (requestUrl.includes('finance.yahoo.com/quote/')) {
    if (behavior === 'unavailable') return new Response('unavailable', { status: 503 });
    return new Response('ok', { headers: { 'set-cookie': 'A=test; Domain=.yahoo.com; Path=/; Secure' } });
  }
  if (requestUrl.includes('/v1/test/getcrumb')) {
    return new Response('test-crumb', { status: behavior === 'unavailable' ? 503 : 200 });
  }
  const yahooSymbols = new URL(requestUrl).searchParams.get('symbols')?.split(',') || [];
  if (behavior === 'unavailable') return new Response('unavailable', { status: 503 });
  const quoteBySymbol = {
    'BTC-USD': { price: 84858.8, previousClose: 84000, exchange: 'CCC' },
    'EURUSD=X': { price: 1.08, previousClose: 1.07, exchange: 'CCY' },
    'ETH-USD': { price: 3000, previousClose: 2900, exchange: 'CCC' },
  };
  const result = yahooSymbols.flatMap((yahooSymbol) => {
    const ticker = quoteBySymbol[yahooSymbol];
    if (!ticker) return [];
    return [{
      symbol: yahooSymbol,
      quoteType: yahooSymbol.includes('=X') ? 'CURRENCY' : 'CRYPTOCURRENCY',
      regularMarketPrice: ticker.price,
      regularMarketPreviousClose: ticker.previousClose,
      regularMarketChangePercent: ((ticker.price / ticker.previousClose) - 1) * 100,
      regularMarketDayHigh: 85200,
      regularMarketDayLow: 83000,
      regularMarketVolume: 120,
      regularMarketTime: quoteUpdatedAt || new Date(logicalNow).toISOString(),
      fullExchangeName: ticker.exchange,
    }];
  });
  return Response.json({ quoteResponse: { result } });
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
assert.equal(calls, 4, 'primary and Yahoo quote feeds should be queried once before cache reuse');

logicalNow += 6000;
quoteUpdatedAt = new Date(logicalNow).toISOString();
const fxQuote = await getLiveMarketQuote('EURUSD');
assert.equal(fxQuote.price, 1.08);
assert.equal(fxQuote.price_source, 'Yahoo Finance (CCY)');
assert.ok(requestedUrls.some((url) => url.includes('/v7/finance/quote') && url.includes('EURUSD%3DX')));

const cryptoQuote = await getLiveMarketQuote('ETHUSD');
assert.equal(cryptoQuote.price, 3000);
assert.equal(cryptoQuote.price_source, 'Yahoo Finance (CCC)');
assert.ok(requestedUrls.some((url) => url.includes('/v7/finance/quote') && url.includes('ETH-USD')));

logicalNow += 6000;
quoteUpdatedAt = new Date(logicalNow - 6 * 60 * 1000).toISOString();
await assert.rejects(getLiveMarketQuote('ETHUSD'), /ETHUSD quote is stale/);

globalThis.fetch = originalFetch;
Date.now = originalDateNow;
console.log('WORKER_MARKET_QUOTES_TESTS_PASSED');
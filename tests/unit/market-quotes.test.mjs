import assert from 'node:assert/strict';
import { clearQuoteCache, getMarketQuote, quoteMarkets } from '../../worker/market-quotes.js';

const originalFetch = globalThis.fetch;
let calls = 0;
let price = 98765.43;
let timestamp = new Date().toISOString();
let fail = false;
const urls = [];
globalThis.fetch = async (url) => {
  calls++;
  urls.push(String(url));
  if (fail) return new Response('', { status: 429 });
  if (String(url).includes('gold-api')) return Response.json({ symbol: 'XAU', currency: 'USD', price, updatedAt: timestamp });
  return Response.json(String(url).includes('coinbase')
    ? { price: String(price), time: timestamp }
    : { chart: { result: [{ meta: { currency: String(url).includes('7203.T') ? 'JPY' : 'USD', regularMarketPrice: price,
      regularMarketTime: Math.floor(Date.parse(timestamp) / 1000), chartPreviousClose: price / 1.02,
      regularMarketDayHigh: price + 2, regularMarketDayLow: price - 2, regularMarketVolume: 123 } }] } });
};
const btc = { symbol: 'BTCUSD', asset_class: 'crypto', price: 1 };
try {
  clearQuoteCache();
  const [display, execution] = await Promise.all([quoteMarkets([btc]), getMarketQuote(btc, { forTrading: true })]);
  assert.equal(calls, 1, 'concurrent reads share one provider request');
  assert.equal(display[0].price, price, 'seed price must not affect provider quote');
  assert.equal(display[0].price, execution.price);
  assert.equal(execution.quote_updated_at, timestamp);
  assert.equal(execution.price_source, 'Coinbase');
  assert.equal(execution.change_24h, null, 'missing statistics must not be fabricated');
  const originalNow=Date.now;
  let clock=originalNow();Date.now=()=>clock;
  try {
    clearQuoteCache();const before=calls;
    await getMarketQuote(btc,{maxCacheMs:5000});clock+=6000;
    await getMarketQuote(btc,{maxCacheMs:5000});
    assert.equal(calls-before,2,'active crypto execution does not reuse a fifteen-second cache');
  }finally{Date.now=originalNow;clearQuoteCache();}

  const fx = await getMarketQuote({ symbol: 'USDJPY', asset_class: 'forex' });
  assert.ok(urls.at(-1).includes('USDJPY%3DX'));
  assert.ok(Math.abs(fx.change_24h - 2) < 1e-10);
  await getMarketQuote({ symbol: 'GC', asset_class: 'futures' });
  assert.ok(urls.at(-1).includes('GC%3DF'));
  await getMarketQuote({ symbol: 'XAUUSD', asset_class: 'forex' });
  assert.ok(urls.at(-1).includes('gold-api.com/price/XAU'), 'spot gold must not be substituted with gold futures');
  const toyota = { symbol: '7203.T', asset_class: 'jp' };
  const nativeQuote = await getMarketQuote(toyota);
  assert.equal(nativeQuote.quote_currency, 'JPY');
  assert.equal(nativeQuote.quote_tradable, false);
  await assert.rejects(getMarketQuote(toyota, { forTrading: true }), /USD settlement is not supported/);

  clearQuoteCache();
  timestamp = new Date(Date.now() - 21 * 60000).toISOString();
  assert.equal((await quoteMarkets([btc]))[0].quote_stale, true);
  await assert.rejects(getMarketQuote(btc, { forTrading: true }), /fresh provider quote/);

  clearQuoteCache();
  fail = true;
  const missing = (await quoteMarkets([btc]))[0];
  assert.equal(missing.price, null);
  assert.equal(missing.price_source, 'Unavailable');
  await assert.rejects(getMarketQuote(btc, { forTrading: true }), /fresh provider quote/);

  clearQuoteCache();
  fail = false;
  price = -1;
  timestamp = new Date().toISOString();
  assert.equal(await getMarketQuote(btc), null);
  console.log('MARKET_QUOTE_TESTS_PASSED');
} finally { globalThis.fetch = originalFetch; clearQuoteCache(); }

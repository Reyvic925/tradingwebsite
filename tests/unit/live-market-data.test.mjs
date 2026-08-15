import assert from 'node:assert/strict';
import { buildQuoteMap, blendLiveQuote } from '../../api-handlers/live-market-data.js';

const quotes = [
  { symbol: 'BTCUSD', price: 65000, change_24h: 1.2, high_24h: 67000, low_24h: 62000, volume: 1230000000 },
  { symbol: 'EURUSD', price: 1.0863, change_24h: 0.35, high_24h: 1.09, low_24h: 1.08, volume: 150000000 },
];

const map = buildQuoteMap(quotes);
assert.equal(map.BTCUSD.price, 65000, 'BTCUSD quote should be mapped by symbol');
assert.equal(map.EURUSD.price, 1.0863, 'EURUSD quote should be mapped by symbol');

const blended = blendLiveQuote({ symbol: 'BTCUSD', price: 50000, change_24h: 0.4, high_24h: 51000, low_24h: 49000 }, map.BTCUSD);
assert.ok(blended.price > 0, 'Blended price must stay positive');
assert.ok(Number.isFinite(blended.change_24h), 'Blended change must be numeric');
assert.ok(blended.source === 'live' || blended.source === 'simulated', 'Source should be either live or simulated');
console.log('LIVE_MARKET_ADAPTER_TESTS_PASSED');

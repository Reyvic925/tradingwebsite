import assert from 'node:assert/strict';
import { assertExecutionQuote } from '../../shared/execution-quote.js';
import { historicalReference, repriceHistoricalTrade, reconcileHistoricalBook, utcTimestamp } from '../../shared/historical-prices.js';
import { capturePendingHistoricalData } from '../../worker/historical-capture.js';

const quote = { price: 100, price_source: 'Recorded exchange', quote_updated_at: '2026-11-13T23:59:59Z' };
assert.equal(assertExecutionQuote(quote, '2026-11-13T23:59:59.500Z'), quote);
assert.throws(() => assertExecutionQuote(quote, '2026-11-14T00:00:01Z'), /same-date/);
assert.throws(() => assertExecutionQuote({ ...quote, quote_updated_at: '2026-11-13T23:59:59Z' }, '2026-11-13T23:59:50Z'), /same-date/);
assert.throws(() => assertExecutionQuote({ ...quote, quote_updated_at: '2026-11-13T23:00:00Z' }, '2026-11-13T23:59:59Z'), /fresh/);
assert.throws(() => assertExecutionQuote({ ...quote, price: 0 }, '2026-11-13T23:59:59Z'), /fresh/);
assert.throws(() => assertExecutionQuote({ ...quote, price_source: '' }, '2026-11-13T23:59:59Z'), /fresh/);
assert.equal(utcTimestamp('2026-11-13 23:59:59'), Date.parse('2026-11-13T23:59:59Z'));
assert.equal(utcTimestamp('2026-11-13T18:59:59-05:00'), Date.parse('2026-11-13T23:59:59Z'));
const bars = [
  { at: '2026-11-13T12:00:00Z', end: '2026-11-13T12:05:00Z', open: 100, close: 102, low: 99, high: 103, source: 'Dated feed', kind: '5m open reference' },
  { at: '2026-11-13T12:05:00Z', end: '2026-11-13T12:10:00Z', open: 110, close: 111, low: 109, high: 112, source: 'Dated feed', kind: '5m open reference' },
];
assert.equal(historicalReference(bars, '2026-11-13T12:01:00Z').price, 100);
assert.equal(historicalReference(bars, '2026-11-13T12:05:00Z').price, 110);
assert.equal(historicalReference(bars, '2026-11-14T12:05:00Z'), null, 'a price from another day must never be substituted');
assert.equal(historicalReference(bars, '2026-11-13T17:00:00Z').kind, 'same-day recorded close reference');
assert.equal(historicalReference([{ ...bars[0], low: 101 }], '2026-11-13T12:00:00Z'), null);
const original = { id: 1, event_id: 'trade', side: 'BUY', symbol: 'BTC-USD', quantity: 1,
  status: 'CLOSED', entry_price: 10, exit_price: 13, fees: 0, pnl: 3, pnl_percent: 0.3,
  traded_at: '2026-11-13T12:00:00Z', closed_at: '2026-11-13T12:05:00Z' };
const repair = repriceHistoricalTrade(original, historicalReference(bars, original.traded_at), historicalReference(bars, original.closed_at));
assert(Math.abs(repair.pnl - 9.979) < 1e-9);
assert.equal(repriceHistoricalTrade(original, null, null), null);
const state = { equity: 1003, peakEquity: 1003, prices: {}, position: null, lastProcessedAt: '2026-11-13T12:10:00Z' };
const corrections = [{ original, repair }];
const book = reconcileHistoricalBook(state, { startingEquity: 1000 }, corrections,
  [{ snapshot_date: '2026-11-13', equity: 1003 }], (symbol, at) => historicalReference(bars, at));
assert(Math.abs(book.state.equity - 1009.979) < 1e-9);
assert(Math.abs(book.snapshots[0].equity - book.state.equity) < 1e-9);
assert(Number.isFinite(repair.pnl_percent));
const repeated = reconcileHistoricalBook(book.state, { startingEquity: 1000 }, [{ original: { ...original, ...repair }, repair }],
  book.snapshots, (symbol, at) => historicalReference(bars, at));
assert(Math.abs(repeated.state.equity - book.state.equity) < 1e-9, 'retries must not apply equity corrections twice');
console.log('HISTORICAL_PRICE_AND_EXECUTION_DATE_TESTS_PASSED');

let capture = null, fetches = 0;
const env = { DB: { prepare: sql => ({
  bind(...values) { this.values = values; return this; },
  async first() { return sql.includes('FROM trader_trades') ? { symbol: 'BRENT', day: '2026-11-13' } : capture ? { repair_json: JSON.stringify(capture) } : null; },
  async run() { assert(sql.startsWith('INSERT INTO trade_price_audit')); capture = JSON.parse(this.values[1]); },
}) } };
const originalFetch = globalThis.fetch;
try {
  globalThis.fetch = async url => {
    fetches++;
    assert.equal(url, 'https://datafeed.dukascopy.com/datafeed/BRENTCMDUSD/2026/10/13/BID_candles_min_1.bi5');
    return new Response(new Uint8Array([93, 0, 0]));
  };
  await capturePendingHistoricalData(env);
  assert.equal(capture.status, 200);
  assert.equal(capture.payload, 'XQAA');
  await capturePendingHistoricalData(env);
  assert.equal(fetches, 1, 'captured data must not be downloaded repeatedly');
  capture = null;
  globalThis.fetch = async () => new Response('', { status: 429, headers: { 'retry-after': '120' } });
  await capturePendingHistoricalData(env);
  assert(capture.retry_at >= Date.now() + 119000);
  assert.equal(capture.payload, undefined, 'failed provider responses must never become market data');
} finally { globalThis.fetch = originalFetch; }
console.log('HISTORICAL_PROVIDER_CAPTURE_TESTS_PASSED');

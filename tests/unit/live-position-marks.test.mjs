import assert from 'node:assert/strict';
import { markLivePositions } from '../../shared/live-position-marks.js';

const now = Date.parse('2026-11-17T12:00:00Z');
const at = new Date(now).toISOString();
const position = { id: 1, symbol: 'BTCUSD', side: 'long', quantity: 2,
  entry_price: 100, current_price: 101, unrealized_pnl: 2, contract_multiplier: 1,
  quote_currency: 'USD', quote_to_usd: 1, valuation_version: 2,
  quote_updated_at: new Date(now - 5000).toISOString(), quote_stale: false };
const snapshot = { account: { cash_balance: 995, realized_pnl: -5, unrealized_pnl: 2,
  equity: 997, available_cash: 795, reserved_cash: 200 }, positions: [position], fills: [] };
const ticks = { BTCUSD: { price: 110, at } };
const marked = markLivePositions(snapshot, ticks, now);
assert.equal(marked.positions[0].current_price, 110);
assert.equal(marked.positions[0].unrealized_pnl, 20);
assert.equal(marked.account.equity, 1015);
assert.equal(marked.account.realized_pnl, -5);
assert.equal(marked.account.available_cash, 795);
assert.equal(marked.account.reserved_cash, 200);
assert.equal(marked.fills, snapshot.fills);
assert.equal(snapshot.positions[0].current_price, 101, 'Live estimates must not mutate recorded snapshots');
assert.equal(markLivePositions(snapshot, {}, now), snapshot);
for (const tick of [{ price: 110, at: new Date(now - 16000).toISOString() },
  { price: 110, at: new Date(now + 2000).toISOString() }, { price: NaN, at },
  { price: 0, at }, { price: 110, at: 'invalid' }]) {
  assert.equal(markLivePositions(snapshot, { BTCUSD: tick }, now), snapshot);
}
const newer = { ...snapshot, positions: [{ ...position, quote_updated_at: new Date(now + 500).toISOString() }] };
assert.equal(markLivePositions(newer, ticks, now), newer, 'An older tick must not replace a newer server mark');
const short = markLivePositions({ ...snapshot, positions: [{ ...position, side: 'short' }] }, ticks, now);
assert.equal(short.positions[0].unrealized_pnl, -20);
const reduced = markLivePositions({ ...snapshot, positions: [{ ...position, quantity: 0.5 }] }, ticks, now);
assert.equal(reduced.positions[0].unrealized_pnl, 5, 'Partial closes must use the latest remaining quantity');
const legacy = markLivePositions({ ...snapshot, positions: [{ ...position, valuation_version: 1, contract_multiplier: 10, quote_to_usd: 2 }] }, ticks, now);
assert.equal(legacy.positions[0].unrealized_pnl, 200, 'Legacy positions retain the server valuation convention');
assert.equal(markLivePositions({ ...snapshot, positions: [] }, ticks, now).positions.length, 0, 'Ticks must not resurrect closed positions');
const nonUsd = { ...snapshot, positions: [{ ...position, quote_currency: 'EUR' }] };
assert.equal(markLivePositions(nonUsd, ticks, now), nonUsd, 'USD crypto ticks cannot revalue positions in other currencies');
assert.equal(markLivePositions(snapshot, ticks, now + 16000), snapshot, 'Expired ticks must fall back to server marks');
console.log('LIVE_POSITION_MARKS_TESTS_PASSED');

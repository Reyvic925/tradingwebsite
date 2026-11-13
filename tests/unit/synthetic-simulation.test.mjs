import assert from 'assert';
import {
  deriveMetrics,
  normalizeSyntheticConfig,
  simulateTick,
} from '../../api-handlers/synthetic-simulation.js';

const config = normalizeSyntheticConfig({
  strategyType: 'momentum',
  assets: ['BTC-USD', 'BTC-USD', 'UNKNOWN'],
  startingEquity: 100000,
  compounding: true,
});

assert.deepEqual(config.assets, ['BTC-USD']);
assert.equal(config.compounding, true);

const initialState = { equity: 100000, prices: {}, peakEquity: 100000, lossStreak: 0 };
const first = simulateTick({ traderId: 7, tickId: 1, timestamp: '2026-01-01T00:00:00.000Z', config, state: initialState });
const repeat = simulateTick({ traderId: 7, tickId: 1, timestamp: '2026-01-01T00:00:00.000Z', config, state: initialState });
assert.deepEqual(first, repeat);

const next = simulateTick({ traderId: 7, tickId: 2, timestamp: '2026-01-01T00:01:00.000Z', config, state: first.state });
if (next.trade) {
  const expectedPnl = next.trade.side === 'BUY'
    ? next.trade.quantity * (next.trade.exit_price - next.trade.entry_price)
    : next.trade.quantity * (next.trade.entry_price - next.trade.exit_price);
  assert(Math.abs(next.trade.pnl - (expectedPnl - next.trade.fees)) < 0.02);
  assert(next.trade.notional <= config.startingEquity * config.maxExposureFraction + 0.01);
}

const metrics = deriveMetrics({
  startingEquity: 100000,
  equity: 101000,
  trades: [{ status: 'CLOSED', pnl: 1000 }, { status: 'CLOSED', pnl: -100 }],
  history: [{ equity: 100000 }, { equity: 101000 }, { equity: 100900 }],
});
assert.equal(metrics.totalReturn, 1);
assert.equal(metrics.winRate, 50);
assert.equal(metrics.maxDrawdown, 0.1);
assert(metrics.volatility >= 0);

const otherTrader = simulateTick({ traderId: 99, tickId: 1, timestamp: '2026-01-01T00:00:00.000Z', config, state: initialState });
assert.deepEqual(first.marketMoves, otherTrader.marketMoves, 'market shocks must be shared across traders');
let running = initialState;
const closed = [];
for (let tick = 1; tick <= 300; tick++) {
  const result = simulateTick({ traderId: 7, tickId: tick, timestamp: new Date(tick * 300000).toISOString(), config, state: running });
  running = result.state;
  if (result.trade) closed.push(result.trade);
}
assert(closed.some(trade => trade.pnl < 0), 'strategy must experience losing trades');
assert(closed.some(trade => trade.pnl > 0));
assert(closed.every(trade => trade.fees > 0));
assert(closed.every(trade => Date.parse(trade.closed_at) > Date.parse(trade.traded_at)), 'positions must persist between ticks');

console.log('SYNTHETIC SIMULATION OK');

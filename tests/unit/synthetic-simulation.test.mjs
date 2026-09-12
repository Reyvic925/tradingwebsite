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
  assert.equal(next.trade.pnl, Number(expectedPnl.toFixed(2)));
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

console.log('SYNTHETIC SIMULATION OK');

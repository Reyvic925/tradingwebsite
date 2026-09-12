import assert from 'assert';
import { calculateSyntheticMetrics } from '../../api-handlers/synthetic-metrics.js';

const metrics = calculateSyntheticMetrics({
  startingEquity: 100000,
  trades: [
    { status: 'CLOSED', pnl: 1000 },
    { status: 'CLOSED', pnl: -100 },
    { status: 'OPEN', pnl: 999999 },
  ],
  snapshots: [
    { equity: 100000 },
    { equity: 101000 },
    { equity: 100900 },
  ],
});

assert.equal(metrics.current_equity, 100900);
assert.equal(metrics.total_return, 0.9);
assert.equal(metrics.total_trades, 2);
assert.equal(metrics.win_rate_trades, 50);
assert.equal(metrics.max_drawdown, 0.1);
assert(metrics.volatility > 0);

const peakAndPullback = calculateSyntheticMetrics({
  startingEquity: 100000,
  snapshots: [
    { equity: 100000 },
    { equity: 150000 },
    { equity: 140000 },
    { equity: 180000 },
    { equity: 160000 },
  ],
});
assert.equal(peakAndPullback.max_drawdown, 11.11);
console.log('SYNTHETIC METRICS OK');

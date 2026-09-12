import assert from 'assert';
import { normalizeSyntheticConfig, simulateTick } from '../api-handlers/synthetic-simulation.js';
import { calculateSyntheticMetrics } from '../api-handlers/synthetic-metrics.js';

const scenarios = [
  { id: 1, name: 'extreme', strategyType: 'martingale', assets: ['BTC-USD', 'ETH-USD'], maxLeverage: 10, compounding: true, riskProfile: 10, volatilityProfile: 1.5 },
  { id: 2, name: 'losing-profile', strategyType: 'mean_reversion', assets: ['XAU-USD'], maxLeverage: 2, compounding: false, riskProfile: 2 },
  { id: 3, name: 'low-volatility', strategyType: 'swing', assets: ['EUR-USD'], maxLeverage: 2, compounding: false, riskProfile: 3, volatilityProfile: 0.2 },
  { id: 4, name: 'high-frequency', strategyType: 'scalper', assets: ['BTC-USD', 'ETH-USD'], maxLeverage: 4, compounding: true, riskProfile: 7 },
  { id: 5, name: 'closed', strategyType: 'momentum', assets: ['BTC-USD'], maxLeverage: 3, compounding: true, riskProfile: 5, closed: true },
];

for (const scenario of scenarios) {
  const config = normalizeSyntheticConfig({ ...scenario, startingEquity: 100000 });
  let state = { equity: config.startingEquity, peakEquity: config.startingEquity, prices: {}, lossStreak: 0 };
  const trades = [];
  const snapshots = [{ equity: state.equity }];
  const eventIds = new Set();

  for (let tick = 1; tick <= 288; tick += 1) {
    if (scenario.closed) continue;
    const timestamp = new Date(Date.UTC(2026, 0, 1, 0, tick * 5)).toISOString();
    const result = simulateTick({ traderId: scenario.id, tickId: tick, timestamp, config, state });
    state = result.state;
    snapshots.push({ equity: state.equity });
    if (result.trade) {
      assert(!eventIds.has(result.trade.event_id));
      eventIds.add(result.trade.event_id);
      const expected = result.trade.side === 'BUY'
        ? result.trade.quantity * (result.trade.exit_price - result.trade.entry_price)
        : result.trade.quantity * (result.trade.entry_price - result.trade.exit_price);
      assert.equal(result.trade.pnl, Number(expected.toFixed(2)));
      trades.push(result.trade);
    }
  }

  const metrics = calculateSyntheticMetrics({ startingEquity: config.startingEquity, trades, snapshots });
  assert(Number.isFinite(metrics.total_return));
  assert(Number.isFinite(metrics.current_equity));
  assert(Number.isFinite(metrics.max_drawdown));
  assert(Number.isFinite(metrics.volatility));
  if (scenario.closed) assert.equal(trades.length, 0);
  console.log(`${scenario.name}: ${trades.length} trades, equity=${state.equity.toFixed(2)}, roi=${metrics.total_return}%`);
}

console.log('24H SYNTHETIC SIMULATION OK');

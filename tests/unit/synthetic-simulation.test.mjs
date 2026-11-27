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

// Market execution must use timestamped quotes without synthetic price drift.
const quotedConfig = { ...config, minimumSignalBps: 0, session: 'crypto', spreadBps: 0, slippageBps: 0, feeBps: 0 };
const quoteTime = '2026-11-14T12:00:00.000Z';
const quote = { price: 96321.45, quote_updated_at: quoteTime, price_source: 'Fixture exchange', quote_stale: false };
let marketState = { ...initialState, prices: { 'BTC-USD': 43200 } };
let marketEntry;
for (let tick = 1; tick <= 20 && !marketEntry; tick++) {
  const result = simulateTick({ traderId: 7, tickId: tick, timestamp: quoteTime,
    config: quotedConfig, state: marketState, marketQuotes: { 'BTC-USD': quote } });
  assert.equal(result.state.prices['BTC-USD'], quote.price);
  marketState = result.state;
  marketEntry = result.openedTrade;
}
assert(marketEntry, 'strategy opens from a provider quote');
assert.equal(marketEntry.entry_price, quote.price);
assert.equal(marketEntry.price_basis, 'market');
assert.equal(marketEntry.entry_quote_at, quoteTime);
assert.equal(marketEntry.entry_price_source, 'Fixture exchange');
const closeQuote = { ...quote, price: 97000 };
const marketClose = simulateTick({ traderId: 7, tickId: 30, timestamp: quoteTime, config: quotedConfig,
  state: marketState, marketQuotes: { 'BTC-USD': closeQuote } });
assert.equal(marketClose.trade.exit_price, closeQuote.price);
assert.equal(marketClose.trade.exit_quote_at, quoteTime);
assert.equal(marketClose.trade.exit_price_source, 'Fixture exchange');
assert.throws(() => simulateTick({ traderId: 7, tickId: 31, timestamp: quoteTime, config: quotedConfig,
  state: marketState, marketQuotes: {} }), /Missing position quote/);
for (const invalid of [{ ...quote, quote_stale: true }, { ...quote, price: 0 },
  { ...quote, quote_updated_at: '2020-01-01T00:00:00Z' }, { ...quote, quote_updated_at: '2030-01-01T00:00:00Z' }]) {
  assert.throws(() => simulateTick({ traderId: 7, tickId: 32, timestamp: quoteTime,
    config: quotedConfig, state: initialState, marketQuotes: { 'BTC-USD': invalid } }), /Invalid execution quote/);
}
console.log('MARKET_PRICE_EXECUTION_TESTS_PASSED');

let noSignalState = { ...initialState, priceBasis: 'market', prices: { 'BTC-USD': quote.price }, signals: { 'BTC-USD': 0 } };
for (let tick = 1; tick <= 20; tick++) {
  const result = simulateTick({ traderId: 7, tickId: tick, timestamp: quoteTime,
    config: { ...quotedConfig, minimumSignalBps: 6 }, state: noSignalState, marketQuotes: { 'BTC-USD': quote } });
  assert.equal(result.openedTrade, null, 'flat price signals must not create cost-driven random entries');
  noSignalState = result.state;
}
const lossQuote = { ...quote, price: quote.price * 0.97 };
const lossResult = simulateTick({ traderId: 7, tickId: 50, timestamp: quoteTime, config: quotedConfig,
  state: { ...marketState, tradingDay: quoteTime.slice(0, 10), dailyOpeningEquity: 100000 }, marketQuotes: { 'BTC-USD': lossQuote } });
assert.equal(lossResult.trade.close_reason, 'daily_loss_limit');
assert.equal(lossResult.state.dailyLossPaused, true);
let pausedState = lossResult.state;
for (let tick = 51; tick <= 70; tick++) {
  const result = simulateTick({ traderId: 7, tickId: tick, timestamp: quoteTime, config: quotedConfig,
    state: pausedState, marketQuotes: { 'BTC-USD': lossQuote } });
  assert.equal(result.openedTrade, null, 'daily loss pause must stop new entries for the rest of the UTC day');
  pausedState = result.state;
}
const nextDay = '2026-11-15T12:00:00Z';
const resumed = simulateTick({ traderId: 7, tickId: 71, timestamp: nextDay, config: quotedConfig,
  state: pausedState, marketQuotes: { 'BTC-USD': { ...lossQuote, quote_updated_at: nextDay } } });
assert.equal(resumed.state.dailyLossPaused, false);
assert.equal(resumed.state.dailyOpeningEquity, pausedState.equity);
console.log('SIGNAL_COST_AND_DAILY_LOSS_CONTROLS_PASSED');

// Every market-backed strategy commits current equity to each new position.
const sizingConfig = { assets: ['BTC-USD'], session: 'crypto', startingEquity: 1000,
  minimumSignalBps: 0, spreadBps: 0, slippageBps: 0, feeBps: 0, dailyLossLimitPercent: 100 };
let fullEntry;
let entryTick;
for (const strategyType of ['momentum', 'mean_reversion', 'scalper', 'swing', 'martingale', 'conservative']) {
  let entry;
  for (let tick = 1; tick <= 100 && !entry; tick++) {
    const result = simulateTick({ traderId: 7, tickId: tick, timestamp: quoteTime,
      config: { ...sizingConfig, strategyType, compounding: false, maxExposureFraction: 0.05,
        riskFraction: 0.001, marketPositionSizeMultiplier: 1 },
      state: { equity: 1500, prices: {}, peakEquity: 1500 }, marketQuotes: { 'BTC-USD': quote } });
    if (result.openedTrade) {
      entry = result;
      if (strategyType === 'conservative') { fullEntry = result; entryTick = tick; }
    }
  }
  assert(entry, `${strategyType} must open an eligible market position`);
  assert(Math.abs(entry.openedTrade.notional - 1500) < 1e-8, `${strategyType} must use all current equity, including gains`);
  assert.equal(entry.openedTrade.leverage, 1);
}
const held = simulateTick({ traderId: 7, tickId: entryTick + 1, timestamp: quoteTime,
  config: { ...sizingConfig, strategyType: 'conservative' }, state: fullEntry.state,
  marketQuotes: { 'BTC-USD': { ...quote, price: quote.price * 1.001 } } });
assert.equal(held.state.position.quantity, fullEntry.openedTrade.quantity, 'Open positions retain their executed quantity');
for (const move of [1.01, 0.99]) {
  const closed = simulateTick({ traderId: 7, tickId: entryTick + 4, timestamp: quoteTime,
    config: { ...sizingConfig, strategyType: 'conservative' },
    state: { ...fullEntry.state, position: { ...fullEntry.state.position, age: 3 } },
    marketQuotes: { 'BTC-USD': { ...quote, price: quote.price * move } } });
  assert.equal(closed.trade.pnl, move > 1 ? 15 : -15);
  const metrics = deriveMetrics({ startingEquity: 1500, equity: closed.state.equity,
    trades: [closed.trade], history: [{ equity: 1500 }, { equity: closed.state.equity }] });
  assert.equal(metrics.totalReturn, move > 1 ? 1 : -1);
  assert.equal(metrics.winRate, move > 1 ? 100 : 0);
}
console.log('FULL_EQUITY_MARKET_POSITION_TESTS_PASSED');

// Opt-in target-win policy: modelled profiles hit the configured rate while
// still recording real losing trades and positive live equity growth.
const targetConfig = normalizeSyntheticConfig({
  ...config,
  enforceTargetWinRate: true,
  targetWinRate: 0.9,
  directionBias: 0.9,
  takeProfitVolatilityRatio: 1.5,
  stopLossVolatilityRatio: 6,
  maxHoldingTicks: 96,
});
assert.equal(targetConfig.enforceTargetWinRate, true);
assert.equal(targetConfig.directionBias, 0.9);

let targetWins = 0;
let targetClosed = 0;
let targetReturns = 0;
const targetReasons = new Set();
for (const traderId of [7, 42, 99]) {
  let running = initialState;
  for (let tick = 1; tick <= 1500; tick += 1) {
    const result = simulateTick({ traderId, tickId: tick,
      timestamp: new Date(tick * 300000).toISOString(), config: targetConfig, state: running });
    running = result.state;
    if (result.trade) {
      targetClosed += 1;
      targetWins += result.trade.pnl > 0 ? 1 : 0;
      targetReasons.add(result.trade.close_reason);
    }
  }
  targetReturns += ((running.equity - 100000) / 100000) * 100;
}
const targetWinRate = (targetWins / targetClosed) * 100;
assert(targetWinRate >= 85 && targetWinRate <= 95, `target win rate out of range: ${targetWinRate}`);
assert(targetWins < targetClosed, 'target policy must keep losing trades');
assert(targetReasons.has('take_profit') && targetReasons.has('stop_loss'));
assert(targetReturns > 0, 'target policy must improve live returns');
console.log('TARGET_WIN_RATE_SIMULATION_TESTS_PASSED');

// Quote-backed execution must still execute at provider prices under the target policy.
const marketTargetConfig = { ...targetConfig, minimumSignalBps: 0, session: 'crypto',
  spreadBps: 0, slippageBps: 0, feeBps: 0, maxHoldingTicks: 1 };
let marketTargetState = { ...initialState, prices: { 'BTC-USD': quote.price }, signals: { 'BTC-USD': 0 } };
let marketTargetEntry = null;
for (let tick = 1; tick <= 20 && !marketTargetEntry; tick += 1) {
  const result = simulateTick({ traderId: 7, tickId: tick, timestamp: quoteTime,
    config: marketTargetConfig, state: marketTargetState, marketQuotes: { 'BTC-USD': quote } });
  marketTargetState = result.state;
  marketTargetEntry = result.openedTrade;
}
assert(marketTargetEntry, 'target policy must still open market-backed positions');
const marketTargetClose = simulateTick({ traderId: 7, tickId: 21, timestamp: quoteTime,
  config: marketTargetConfig, state: marketTargetState, marketQuotes: { 'BTC-USD': closeQuote } });
assert(marketTargetClose.trade, 'target policy must close market-backed positions on the holding limit');
assert.equal(marketTargetClose.trade.exit_price, closeQuote.price);
assert.equal(marketTargetClose.trade.close_reason, 'max_holding_ticks');
console.log('TARGET_POLICY_MARKET_EXECUTION_TESTS_PASSED');

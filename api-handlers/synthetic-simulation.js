import { assertExecutionQuote } from '../shared/execution-quote.js';

const ASSET_SPECS = {
  'BTC-USD': { basePrice: 43200, volatility: 0.012, drift: 0.0008, correlation: 'crypto' },
  'ETH-USD': { basePrice: 2280, volatility: 0.014, drift: 0.0007, correlation: 'crypto' },
  'SOL-USD': { basePrice: 98.5, volatility: 0.02, drift: 0.0006, correlation: 'crypto' },
  'XAU-USD': { basePrice: 2045.5, volatility: 0.004, drift: 0.0002, correlation: 'metals' },
  WTI: { basePrice: 79.15, volatility: 0.012, drift: 0.0003, correlation: 'energy' },
  BRENT: { basePrice: 83.4, volatility: 0.01, drift: 0.0003, correlation: 'energy' },
  'EUR-USD': { basePrice: 1.082, volatility: 0.0025, drift: 0.0001, correlation: 'fx' },
  'GBP-USD': { basePrice: 1.265, volatility: 0.003, drift: 0.0001, correlation: 'fx' },
  'USD-JPY': { basePrice: 148.9, volatility: 0.0028, drift: 0.0001, correlation: 'fx' },
  NASDAQ: { basePrice: 15180.5, volatility: 0.006, drift: 0.0003, correlation: 'equities' },
  SPX500: { basePrice: 4825.3, volatility: 0.004, drift: 0.00025, correlation: 'equities' },
  AAPL: { basePrice: 190, volatility: 0.007, drift: 0.0002, correlation: 'equities' },
  NVDA: { basePrice: 130, volatility: 0.012, drift: 0.0003, correlation: 'equities' },
  TSLA: { basePrice: 240, volatility: 0.014, drift: 0.0002, correlation: 'equities' },
  MSFT: { basePrice: 420, volatility: 0.006, drift: 0.0002, correlation: 'equities' },
  AMZN: { basePrice: 200, volatility: 0.008, drift: 0.0002, correlation: 'equities' },
  DAX40: { basePrice: 19000, volatility: 0.005, drift: 0.0002, correlation: 'equities' },
  CAC40: { basePrice: 7600, volatility: 0.005, drift: 0.0002, correlation: 'equities' },
  'AVAX-USD': { basePrice: 30, volatility: 0.02, drift: 0.0003, correlation: 'crypto' },
  'USD-CHF': { basePrice: 0.88, volatility: 0.002, drift: 0, correlation: 'fx' },
  'GBP-JPY': { basePrice: 190, volatility: 0.0035, drift: 0.0001, correlation: 'fx' },
  'USD-BRL': { basePrice: 5.1, volatility: 0.004, drift: 0.0001, correlation: 'fx' },
  'USD-MXN': { basePrice: 19, volatility: 0.004, drift: 0.0001, correlation: 'fx' },
};

const STRATEGY_PROFILES = {
  momentum: { tradeProbability: 0.72, holdingTicks: 1, directionBias: 0.68, riskFraction: 0.012, maxExposureFraction: 0.5 },
  mean_reversion: { tradeProbability: 0.58, holdingTicks: 1, directionBias: 0.42, riskFraction: 0.008, maxExposureFraction: 0.35 },
  scalper: { tradeProbability: 0.9, holdingTicks: 1, directionBias: 0.52, riskFraction: 0.004, maxExposureFraction: 0.2 },
  swing: { tradeProbability: 0.28, holdingTicks: 3, directionBias: 0.62, riskFraction: 0.018, maxExposureFraction: 0.75 },
  martingale: { tradeProbability: 0.7, holdingTicks: 1, directionBias: 0.56, riskFraction: 0.02, maxExposureFraction: 1 },
  conservative: { tradeProbability: 0.2, holdingTicks: 4, directionBias: 0.58, riskFraction: 0.004, maxExposureFraction: 0.15 },
};

function hashString(value) {
  let hash = 2166136261;
  for (const character of String(value)) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function seededRandom(seed) {
  let state = hashString(seed);
  return () => {
    state += 0x6D2B79F5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

export function normalizeSyntheticConfig(config = {}) {
  const strategyType = String(config.strategyType || 'momentum').toLowerCase();
  const profile = STRATEGY_PROFILES[strategyType] || STRATEGY_PROFILES.momentum;
  const assets = [...new Set((Array.isArray(config.assets) ? config.assets : ['BTC-USD'])
    .map((asset) => {
      const symbol = String(asset).trim().toUpperCase();
      return ASSET_SPECS[symbol] ? symbol : symbol.endsWith('-USD') && ASSET_SPECS[symbol.slice(0, -4)] ? symbol.slice(0, -4) : symbol;
    })
    .filter((asset) => ASSET_SPECS[asset]))];

  const targetReturnProfile = Number.isFinite(Number(config.targetReturnProfile))
    ? Number(config.targetReturnProfile)
    : 45;
  const targetScale = Math.max(0.5, Math.sqrt(Math.max(1, Math.abs(targetReturnProfile)) / 45));

  return {
    ...profile,
    strategyType: STRATEGY_PROFILES[strategyType] ? strategyType : 'momentum',
    assetClass: config.assetClass || 'multi_asset',
    assets: assets.length ? assets : ['BTC-USD'],
    session: config.session || 'crypto',
    startingEquity: Math.max(0.01, Number(config.startingEquity) || 100000),
    targetReturnProfile,
    targetWinRate: Math.min(0.99, Math.max(0.01, Number(config.targetWinRate) || 0.575)),
    averageWinR: Math.max(0.01, Number(config.averageWinR) || 1.2),
    averageLossR: Math.max(0.01, Number(config.averageLossR) || 1),
    volatilityProfile: Math.max(0.01, Number(config.volatilityProfile) || 1),
    maxLeverage: Math.max(1, Number(config.maxLeverage) || 3),
    tradeFrequency: config.tradeFrequency || strategyType,
    riskProfile: Math.min(10, Math.max(1, Math.trunc(Number(config.riskProfile) || 5))),
    compounding: config.compounding !== false,
    minimumSignalBps: Math.max(0, Number(config.minimumSignalBps ?? 6)),
    dailyLossLimitPercent: Math.min(100, Math.max(0.1, Number(config.dailyLossLimitPercent ?? 1))),
    riskFraction: Math.max(0.001, Number(config.riskFraction) || profile.riskFraction * targetScale),
    maxExposureFraction: Math.max(0.05, Number(config.maxExposureFraction) || profile.maxExposureFraction),
    marketPositionSizeMultiplier: Math.min(4, Math.max(1, Number(config.marketPositionSizeMultiplier) || 2)),
    metricBaseline: config.metricBaseline,
  };
}

export function getAssetSpec(asset) {
  return ASSET_SPECS[String(asset).toUpperCase()] || ASSET_SPECS['BTC-USD'];
}

export function deriveMetrics({ startingEquity, equity, trades = [], history = [] }) {
  const closedTrades = trades.filter((trade) => trade.status === 'CLOSED');
  const wins = closedTrades.filter((trade) => Number(trade.pnl) > 0).length;
  const returns = history.slice(1).map((snapshot, index) => {
    const previous = Number(history[index].equity);
    const current = Number(snapshot.equity);
    return previous > 0 ? (current - previous) / previous : 0;
  });
  let peak = Number(startingEquity) || 0;
  let maxDrawdown = 0;
  for (const snapshot of history) {
    const value = Number(snapshot.equity);
    peak = Math.max(peak, value);
    if (peak > 0) maxDrawdown = Math.min(maxDrawdown, (value - peak) / peak);
  }
  const mean = returns.length ? returns.reduce((sum, value) => sum + value, 0) / returns.length : 0;
  const variance = returns.length
    ? returns.reduce((sum, value) => sum + ((value - mean) ** 2), 0) / returns.length
    : 0;

  return {
    currentEquity: Number(Number(equity).toFixed(2)),
    totalReturn: Number((((Number(equity) - Number(startingEquity)) / Number(startingEquity)) * 100).toFixed(2)),
    winRate: closedTrades.length ? Number(((wins / closedTrades.length) * 100).toFixed(2)) : 0,
    maxDrawdown: Number((Math.abs(maxDrawdown) * 100).toFixed(2)),
    volatility: Number((Math.sqrt(variance) * 100).toFixed(4)),
    totalTrades: closedTrades.length,
    dailyReturn: returns.length ? Number((returns[returns.length - 1] * 100).toFixed(2)) : 0,
  };
}

export function simulateTick({ traderId, tickId, timestamp, config, state, marketQuotes }) {
  const normalizedConfig = normalizeSyntheticConfig(config);
  const random = seededRandom(`${traderId}:${tickId}:${normalizedConfig.strategyType}`);
  const profile = STRATEGY_PROFILES[normalizedConfig.strategyType];
  // Market shocks are shared across traders; strategy decisions use a separate seed.
  const regime = seededRandom(`regime:${Math.floor(tickId / 24)}`)();
  const stress = regime < 0.12 ? 2.5 : regime > 0.85 ? 0.55 : 1;
  const marketBacked = marketQuotes !== undefined;
  const previousPrices = marketBacked && state.priceBasis !== 'market' ? {} : state.prices || {};
  const date = new Date(timestamp);
  const hour = date.getUTCHours();
  const weekday = date.getUTCDay() !== 0 && date.getUTCDay() !== 6;
  const sessionOpen = normalizedConfig.session === 'crypto' || (weekday && ({
    sydney: hour >= 22 || hour <= 7, asia: hour >= 22 || hour <= 7,
    tokyo: hour < 9, london: hour >= 8 && hour < 17, nyc: hour >= 13 && hour < 22,
  })[normalizedConfig.session]);
  const assetOpen = asset => {
    if (marketBacked && !marketQuotes[asset]) return false;
    const group = getAssetSpec(asset).correlation;
    return group === 'crypto' || (weekday && (group !== 'equities' || hour >= 13 && hour < 22));
  };
  const nextPrices = {};
  const marketMoves = {};
  for (const asset of normalizedConfig.assets) {
    const spec = getAssetSpec(asset);
    if (marketBacked) {
      const quote = marketQuotes[asset];
      if (!quote) continue;
      try { assertExecutionQuote(quote, timestamp, { maxAgeMs: spec.correlation === 'crypto' ? 90000 : undefined }); }
      catch { throw new Error(`Invalid execution quote for ${asset}`); }
      nextPrices[asset] = quote.price;
      const previous = Number(previousPrices[asset]);
      marketMoves[asset] = previous > 0 ? quote.price / previous - 1 : 0;
      continue;
    }
    const factor = seededRandom(`market:${tickId}:${spec.correlation}`)() * 2 - 1;
    const noise = seededRandom(`asset:${tickId}:${asset}`)() * 2 - 1;
    const move = assetOpen(asset) ? spec.drift + (factor * 0.7 + noise * 0.3) * spec.volatility * stress : 0;
    nextPrices[asset] = Number(((Number(previousPrices[asset]) || spec.basePrice) * Math.max(0.01, 1 + move)).toFixed(8));
    marketMoves[asset] = move;
  }
  if (marketBacked && state.position && !nextPrices[state.position.symbol]) {
    throw new Error(`Missing position quote for ${state.position.symbol}`);
  }
  const spreadBps = Math.min(100, Math.max(0, Number(config.spreadBps ?? 2)));
  const slippageBps = Math.min(100, Math.max(0, Number(config.slippageBps ?? 1)));
  const feeBps = Math.min(100, Math.max(0, Number(config.feeBps ?? 1)));
  const friction = (spreadBps / 2 + slippageBps * stress) / 10000;
  let equity = Number(state.equity ?? normalizedConfig.startingEquity);
  const tradingDay = timestamp.slice(0, 10);
  const dailyOpeningEquity = state.tradingDay === tradingDay ? Number(state.dailyOpeningEquity ?? equity) : equity;
  const dailyFloor = dailyOpeningEquity * (1 - normalizedConfig.dailyLossLimitPercent / 100);
  let dailyLossReached = marketBacked && equity <= dailyFloor;
  const candidateAsset = normalizedConfig.assets[tickId % normalizedConfig.assets.length];
  const previousSignal = Number(state.signals?.[candidateAsset] || 0);
  const minimumMove = Math.max(normalizedConfig.minimumSignalBps / 10000, 2 * friction + 2 * feeBps / 10000);
  const signalReady = !marketBacked || normalizedConfig.minimumSignalBps === 0 || Math.abs(previousSignal) >= minimumMove;
  let position = state.position ? { ...state.position } : null;
  let trade = null;
  let openedTrade = null;
  let lossStreak = Number(state.lossStreak || 0);
  if (position) {
    const price = nextPrices[position.symbol];
    const mark = Number(previousPrices[position.symbol]) || position.entry_price;
    const direction = position.side === 'BUY' ? 1 : -1;
    equity += direction * (price - mark) * position.quantity;
    dailyLossReached = marketBacked && equity <= dailyFloor;
    if (assetOpen(position.symbol) && config.advancePositionAge !== false) position.age += 1;
    const tradeLoss = direction * (price - position.entry_price) / position.entry_price;
    if (assetOpen(position.symbol) && (dailyLossReached || (config.advancePositionAge !== false && position.age >= profile.holdingTicks) || tradeLoss <= -getAssetSpec(position.symbol).volatility * 2 || equity <= 0)) {
      const exit = price * (1 - direction * friction);
      const exitFee = exit * position.quantity * feeBps / 10000;
      equity += direction * (exit - price) * position.quantity - exitFee;
      const fees = position.entry_fee + exitFee;
      const pnl = direction * (exit - position.entry_price) * position.quantity - fees;
      trade = { ...position, exit_price_source: marketQuotes?.[position.symbol]?.price_source, exit_quote_at: marketQuotes?.[position.symbol]?.quote_updated_at, exit_price: exit, fees: Number(fees.toFixed(2)), pnl: Number(pnl.toFixed(2)),
        pnl_percent: pnl / position.equity_at_entry * 100, status: 'CLOSED', closed_at: timestamp,
        close_reason: dailyLossReached ? 'daily_loss_limit' : tradeLoss <= -getAssetSpec(position.symbol).volatility * 2 ? 'position_stop' : equity <= 0 ? 'capital_exhausted' : 'strategy_exit' };
      lossStreak = pnl < 0 ? lossStreak + 1 : 0;
      position = null;
    }
  } else if (config.tradingEnabled !== false && !dailyLossReached && signalReady && sessionOpen && equity > 1 && random() < profile.tradeProbability && assetOpen(candidateAsset)) {
    const asset = candidateAsset;
    // Decisions use only the previous tick's signal, never the move being traded.
    const signal = Number(state.signals?.[asset] || 0);
    let bullish = signal >= 0;
    if (normalizedConfig.strategyType === 'mean_reversion') bullish = !bullish;
    if (!marketBacked && (normalizedConfig.strategyType === 'scalper' || Math.abs(signal) < 0.0001)) bullish = random() < profile.directionBias;
    const side = bullish ? 'BUY' : 'SELL';
    const direction = bullish ? 1 : -1;
    const mark = nextPrices[asset];
    const entry = mark * (1 + direction * friction);
    const martingale = normalizedConfig.strategyType === 'martingale' ? Math.min(4, 1 + lossStreak * 0.5) : 1;
    const riskBase = normalizedConfig.compounding ? equity : normalizedConfig.startingEquity;
    const baseExposure = Math.min(normalizedConfig.maxExposureFraction,
      normalizedConfig.riskFraction * martingale / getAssetSpec(asset).volatility);
    const exposure = marketBacked
      ? Math.min(1, baseExposure * normalizedConfig.marketPositionSizeMultiplier)
      : baseExposure;
    const quantity = Math.min(equity, riskBase) * exposure / entry;
    const entryFee = entry * quantity * feeBps / 10000;
    position = { price_basis: marketBacked ? 'market' : 'synthetic', entry_price_source: marketQuotes?.[asset]?.price_source, entry_quote_at: marketQuotes?.[asset]?.quote_updated_at, event_id: `${traderId}:${tickId}`, trader_id: traderId, symbol: asset, side,
      quantity, entry_price: entry, entry_fee: entryFee, equity_at_entry: equity,
      margin: quantity * entry, leverage: 1, notional: quantity * entry, age: 0,
      status: 'OPEN', traded_at: timestamp };
    equity += direction * (mark - entry) * quantity - entryFee;
    openedTrade = { ...position };
  }
  const peakEquity = Math.max(Number(state.peakEquity || normalizedConfig.startingEquity), equity);
  const maxDrawdown = Math.max(Number(state.maxDrawdown || 0), peakEquity > 0 ? (peakEquity - Math.max(0, equity)) / peakEquity * 100 : 0);
  const nextState = { ...state, tradingDay, dailyOpeningEquity, dailyLossPaused: marketBacked && equity <= dailyFloor,
    priceBasis: marketBacked ? 'market' : 'synthetic', maxDrawdown, prices: nextPrices, signals: marketMoves, position,
    equity: Math.max(0, equity), peakEquity: Math.max(Number(state.peakEquity || normalizedConfig.startingEquity), equity),
    tickIndex: tickId, lossStreak, lastProcessedAt: timestamp };
  return { config: normalizedConfig, state: nextState, trade, openedTrade, marketMoves };
}

export const syntheticAssetRegistry = ASSET_SPECS;
export const syntheticStrategyProfiles = STRATEGY_PROFILES;

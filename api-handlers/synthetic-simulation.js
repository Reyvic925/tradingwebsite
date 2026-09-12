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
};

const STRATEGY_PROFILES = {
  momentum: { tradeProbability: 0.72, holdingTicks: 1, directionBias: 0.68, riskFraction: 0.012 },
  mean_reversion: { tradeProbability: 0.58, holdingTicks: 1, directionBias: 0.42, riskFraction: 0.008 },
  scalper: { tradeProbability: 0.9, holdingTicks: 1, directionBias: 0.52, riskFraction: 0.004 },
  swing: { tradeProbability: 0.28, holdingTicks: 3, directionBias: 0.62, riskFraction: 0.018 },
  martingale: { tradeProbability: 0.7, holdingTicks: 1, directionBias: 0.56, riskFraction: 0.02 },
  conservative: { tradeProbability: 0.2, holdingTicks: 4, directionBias: 0.58, riskFraction: 0.004 },
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
    .map((asset) => String(asset).trim().toUpperCase())
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
    riskFraction: Math.max(0.001, Number(config.riskFraction) || profile.riskFraction * targetScale),
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

export function simulateTick({ traderId, tickId, timestamp, config, state }) {
  const normalizedConfig = normalizeSyntheticConfig(config);
  const random = seededRandom(`${traderId}:${tickId}:${normalizedConfig.strategyType}`);
  const previousPrices = { ...(state.prices || {}) };
  const nextPrices = { ...previousPrices };
  const marketMoves = {};
  const correlationFactors = {};

  for (const asset of normalizedConfig.assets) {
    const spec = getAssetSpec(asset);
    const previous = Number(previousPrices[asset]) || spec.basePrice;
    const factor = correlationFactors[spec.correlation] ?? ((random() - 0.5) * 2);
    correlationFactors[spec.correlation] = factor;
    const idiosyncraticNoise = (random() - 0.5) * 2;
    const move = spec.drift + (factor * 0.65 + idiosyncraticNoise * 0.35) * spec.volatility * normalizedConfig.volatilityProfile;
    nextPrices[asset] = Number((previous * Math.max(0.0001, 1 + move)).toFixed(8));
    marketMoves[asset] = move;
  }

  const asset = normalizedConfig.assets[tickId % normalizedConfig.assets.length];
  const move = marketMoves[asset];
  const profile = STRATEGY_PROFILES[normalizedConfig.strategyType] || STRATEGY_PROFILES.momentum;
  const opensTrade = random() <= profile.tradeProbability;
  const price = nextPrices[asset];
  const previousPrice = Number(previousPrices[asset]) || getAssetSpec(asset).basePrice;
  const trendSignal = move >= 0;
  const followsSignal = random() <= profile.directionBias;
  const strategySignal = normalizedConfig.strategyType === 'mean_reversion'
    ? !trendSignal
    : trendSignal;
  const expectedBullish = followsSignal ? strategySignal : !strategySignal;
  const winningDecision = random() <= normalizedConfig.targetWinRate;
  const bullishDecision = winningDecision ? expectedBullish : !expectedBullish;
  const side = bullishDecision ? 'BUY' : 'SELL';
  const equity = Number(state.equity) || normalizedConfig.startingEquity;
  const lossStreak = Number(state.lossStreak) || 0;
  const martingaleMultiplier = normalizedConfig.strategyType === 'martingale'
    ? Math.min(8, 1 + lossStreak * 0.5)
    : 1;
  const accountBase = normalizedConfig.compounding ? equity : normalizedConfig.startingEquity;
  const margin = accountBase * profile.riskFraction * martingaleMultiplier;
  const leverage = Math.min(normalizedConfig.maxLeverage, 1 + random() * (normalizedConfig.maxLeverage - 1));
  const quantity = margin * leverage / previousPrice;
  const tradeMove = side === 'BUY' ? price - previousPrice : previousPrice - price;
  const pnl = opensTrade ? tradeMove * quantity : 0;
  const nextEquity = Math.max(0.01, equity + pnl);
  const trade = opensTrade ? {
    event_id: `${traderId}:${tickId}`,
    trader_id: traderId,
    symbol: asset,
    side,
    quantity: Number(quantity.toFixed(8)),
    entry_price: Number(previousPrice.toFixed(8)),
    exit_price: Number(price.toFixed(8)),
    margin: Number(margin.toFixed(2)),
    leverage: Number(leverage.toFixed(4)),
    pnl: Number(pnl.toFixed(2)),
    price_move_percent: Number((((price - previousPrice) / previousPrice) * 100).toFixed(4)),
    trade_return_percent: Number(((pnl / Math.max(margin, 0.01)) * 100).toFixed(4)),
    account_return_percent: Number(((pnl / Math.max(equity, 0.01)) * 100).toFixed(4)),
    pnl_percent: Number(((pnl / Math.max(equity, 0.01)) * 100).toFixed(4)),
    status: 'CLOSED',
    traded_at: timestamp,
    closed_at: timestamp,
  } : null;
  const nextState = {
    ...state,
    prices: nextPrices,
    equity: nextEquity,
    peakEquity: Math.max(Number(state.peakEquity) || normalizedConfig.startingEquity, nextEquity),
    tickIndex: tickId,
    lossStreak: pnl < 0 ? lossStreak + 1 : 0,
    lastProcessedAt: timestamp,
  };

  return { config: normalizedConfig, state: nextState, trade, marketMoves };
}

export const syntheticAssetRegistry = ASSET_SPECS;
export const syntheticStrategyProfiles = STRATEGY_PROFILES;

const DEFAULT_CRYPTO_ASSETS = ['BTC-USD', 'ETH-USD', 'SOL-USD'];
const DEFAULT_FX_ASSETS = ['EUR-USD', 'GBP-USD', 'USD-JPY'];
const SUSPICIOUS_PLACEHOLDERS = new Set(['', 'N/A', 'NA', 'NULL', 'NONE', '+1', '1', '0']);
const CRYPTO_TOKENS = new Set(['BTC', 'ETH', 'SOL', 'AVAX', 'BNB', 'MATIC', 'ADA', 'XRP', 'DOGE']);
const COMMODITY_TOKENS = new Set(['WTI', 'BRENT', 'XAU', 'GOLD', 'OIL', 'USD']);
const FX_TOKENS = new Set(['EUR', 'GBP', 'USD', 'JPY', 'CHF', 'AUD', 'CAD', 'NZD']);

export function normalizeToken(value) {
  if (value === null || value === undefined) return '';
  const candidate = String(value).trim().replace(/^#/, '').replace(/\s+/g, '').toUpperCase();
  if (!candidate || SUSPICIOUS_PLACEHOLDERS.has(candidate) || /^\+\d+$/.test(candidate)) return '';
  return candidate;
}

export function normalizeAssetFocus(assetFocus = [], fallback = DEFAULT_CRYPTO_ASSETS) {
  const rawItems = Array.isArray(assetFocus) ? assetFocus : String(assetFocus || '').split(',');
  const seen = new Set();
  const cleaned = [];

  for (const item of rawItems) {
    const token = normalizeToken(item);
    if (!token) continue;
    const canonical = token.includes('-') ? token : `${token}-USD`;
    if (!seen.has(canonical)) {
      seen.add(canonical);
      cleaned.push(canonical);
    }
    if (cleaned.length >= 6) break;
  }

  if (!cleaned.length) return [...fallback];

  const deduped = [...new Set(cleaned)];
  return deduped.slice(0, 3);
}

export function validateTraderRecord(trader = {}) {
  const candidate = { ...trader };
  const name = String(candidate.name || 'Unknown trader').trim() || 'Unknown trader';
  const bio = String(candidate.bio || '').trim();

  if (!name || name === 'Unknown trader') {
    throw new Error('Trader name is required');
  }

  if (candidate.asset_focus) {
    candidate.asset_focus = normalizeAssetFocus(candidate.asset_focus, DEFAULT_CRYPTO_ASSETS);
    if (!candidate.asset_focus.length) {
      throw new Error('Trader asset focus must not be empty');
    }
  }

  if (candidate.starting_equity !== undefined) {
    const startingEquity = Number(candidate.starting_equity);
    if (!Number.isFinite(startingEquity) || startingEquity <= 0) {
      throw new Error('starting_equity must be a positive number');
    }
  }

  if (candidate.current_equity !== undefined) {
    const currentEquity = Number(candidate.current_equity);
    if (!Number.isFinite(currentEquity) || currentEquity < 0) {
      throw new Error('current_equity must be a non-negative number');
    }
  }

  if (candidate.total_return !== undefined) {
    const totalReturn = Number(candidate.total_return);
    if (!Number.isFinite(totalReturn)) {
      throw new Error('total_return must be a finite number');
    }
  }

  if (candidate.monthly_return !== undefined) {
    const monthlyReturn = Number(candidate.monthly_return);
    if (!Number.isFinite(monthlyReturn)) {
      throw new Error('monthly_return must be a finite number');
    }
  }

  if (candidate.win_rate_trades !== undefined) {
    const winRate = Number(candidate.win_rate_trades);
    if (!Number.isFinite(winRate) || winRate < 0 || winRate > 100) {
      throw new Error('win_rate_trades must be between 0 and 100');
    }
  }

  if (candidate.max_drawdown !== undefined) {
    const drawdown = Number(candidate.max_drawdown);
    if (!Number.isFinite(drawdown) || drawdown < 0 || drawdown > 100) {
      throw new Error('max_drawdown must be between 0 and 100');
    }
  }

  if (candidate.volatility !== undefined) {
    const volatility = Number(candidate.volatility);
    if (!Number.isFinite(volatility) || volatility < 0) {
      throw new Error('volatility must be a non-negative number');
    }
  }

  if (candidate.risk_score !== undefined) {
    const riskScore = Number(candidate.risk_score);
    if (!Number.isFinite(riskScore) || Math.trunc(riskScore) < 1 || Math.trunc(riskScore) > 10) {
      throw new Error('risk_score must be an integer between 1 and 10');
    }
  }

  if (candidate.followers !== undefined) {
    const followers = Number(candidate.followers);
    if (!Number.isFinite(followers) || followers < 0) {
      throw new Error('followers must be a non-negative number');
    }
  }

  if (candidate.total_trades !== undefined) {
    const totalTrades = Number(candidate.total_trades);
    if (!Number.isFinite(totalTrades) || totalTrades < 0) {
      throw new Error('total_trades must be a non-negative integer');
    }
  }

  if (candidate.profit_for_copiers !== undefined) {
    const profitForCopiers = Number(candidate.profit_for_copiers);
    if (!Number.isFinite(profitForCopiers)) {
      throw new Error('profit_for_copiers must be a finite number');
    }
  }

  if (candidate.under_management !== undefined) {
    const underManagement = Number(candidate.under_management);
    if (!Number.isFinite(underManagement) || underManagement < 0) {
      throw new Error('under_management must be a non-negative number');
    }
  }

  if (candidate.is_active !== undefined && typeof candidate.is_active !== 'boolean') {
    throw new Error('is_active must be a boolean');
  }

  if (bio && bio.length > 500) {
    throw new Error('Trader bio exceeds the maximum supported length');
  }

  return {
    ...candidate,
    name,
    bio,
    asset_focus: candidate.asset_focus || normalizeAssetFocus([], DEFAULT_CRYPTO_ASSETS),
  };
}

export function sanitizeTraderRecord(trader = {}) {
  return validateTraderRecord(trader);
}

export function filterVisibleTraders(traders = []) {
  return (Array.isArray(traders) ? traders : []).filter((trader) => trader?.is_active !== false);
}

export default {
  normalizeAssetFocus,
  sanitizeTraderRecord,
  validateTraderRecord,
  filterVisibleTraders
};

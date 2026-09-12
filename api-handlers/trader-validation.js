const DEFAULT_CRYPTO_ASSETS = ['BTC-USD', 'ETH-USD', 'SOL-USD'];
const DEFAULT_FX_ASSETS = ['EUR-USD', 'GBP-USD', 'USD-JPY'];
const SUSPICIOUS_PLACEHOLDERS = new Set(['', 'N/A', 'NA', 'NULL', 'NONE', '+1', '1', '0']);
const CRYPTO_TOKENS = new Set(['BTC', 'ETH', 'SOL', 'AVAX', 'BNB', 'MATIC', 'ADA', 'XRP', 'DOGE']);
const COMMODITY_TOKENS = new Set(['WTI', 'BRENT', 'XAU', 'GOLD', 'OIL', 'USD']);
const FX_TOKENS = new Set(['EUR', 'GBP', 'USD', 'JPY', 'CHF', 'AUD', 'CAD', 'NZD']);

function clampNumber(value, min, max) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return min;
  return Math.min(Math.max(numeric, min), max);
}

function normalizeToken(value) {
  if (value === null || value === undefined) return '';
  const candidate = String(value).trim().replace(/^#/, '').replace(/\s+/g, '').toUpperCase();
  if (!candidate || SUSPICIOUS_PLACEHOLDERS.has(candidate) || /^\+\d+$/.test(candidate)) return '';
  return candidate;
}

function looksLikeCryptoDescription(name = '', bio = '', specialty = '', assetFocus = []) {
  const haystack = [name, bio, specialty, assetFocus.join(' ')].join(' ').toLowerCase();
  return /(crypto|digital asset|digital-asset|btc|eth|sol|avax|bnb|matic|market sentiment|momentum)/i.test(haystack);
}

function prefersCryptoFallback(assetFocus = []) {
  const values = (Array.isArray(assetFocus) ? assetFocus : []).map(normalizeToken).filter(Boolean);
  if (!values.length) return true;

  const levels = values.map((value) => {
    if (CRYPTO_TOKENS.has(value)) return 'crypto';
    if (COMMODITY_TOKENS.has(value) || FX_TOKENS.has(value)) return 'macro';
    return 'other';
  });

  return levels.every((level) => level === 'macro') && values.some((value) => COMMODITY_TOKENS.has(value));
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

  const prioritised = cleaned.filter((token) => {
    if (token.startsWith('BTC-') || token.startsWith('ETH-') || token.startsWith('SOL-') || token.startsWith('AVAX-') || token.startsWith('BNB-')) return true;
    if (token.startsWith('USD-') || token.startsWith('EUR-') || token.startsWith('GBP-') || token.startsWith('JPY-') || token.startsWith('CHF-')) return true;
    if (token === 'XAU' || token === 'WTI' || token === 'BRENT' || token === 'GOLD') return false;
    return true;
  });

  if (!prioritised.length) return [...fallback];
  if (prioritised.every((token) => token === 'XAU' || token === 'WTI' || token === 'BRENT' || token === 'GOLD' || token === 'USD')) {
    return [...fallback];
  }

  const deduped = [...new Set(prioritised)];
  return deduped.length >= 3 ? deduped.slice(0, 3) : deduped;
}

export function sanitizeTraderRecord(trader = {}) {
  const name = String(trader.name || 'Unknown trader').trim() || 'Unknown trader';
  const bio = String(trader.bio || '').trim();
  const specialty = String(trader.specialty || '').trim();

  let assetFocus = Array.isArray(trader.asset_focus) ? trader.asset_focus : [];
  const shouldUseCryptoFallback = looksLikeCryptoDescription(name, bio, specialty, assetFocus) || prefersCryptoFallback(assetFocus);

  if (shouldUseCryptoFallback) {
    assetFocus = normalizeAssetFocus(assetFocus, DEFAULT_CRYPTO_ASSETS);
    if (!assetFocus.some((token) => CRYPTO_TOKENS.has(token.split('-')[0]))) {
      assetFocus = [...DEFAULT_CRYPTO_ASSETS];
    }
  } else {
    assetFocus = normalizeAssetFocus(assetFocus, DEFAULT_FX_ASSETS);
  }

  const totalReturn = clampNumber(trader.total_return ?? 0, 0, 250);
  const monthlyReturn = clampNumber(trader.monthly_return ?? totalReturn * 0.35, 0, 150);
  const winRateTrades = clampNumber(trader.win_rate_trades ?? trader.win_rate ?? 50, 0, 100);
  const followers = Math.max(0, Math.trunc(Number(trader.followers ?? trader.copiers_current ?? 0) || 0));
  const isActive = trader.is_active === undefined ? true : Boolean(trader.is_active);

  return {
    ...trader,
    name,
    bio,
    specialty,
    asset_focus: assetFocus,
    total_return: Number(totalReturn.toFixed(2)),
    monthly_return: Number(monthlyReturn.toFixed(2)),
    win_rate_trades: Number(winRateTrades.toFixed(2)),
    followers,
    is_active: isActive,
  };
}

export function filterVisibleTraders(traders = []) {
  return (Array.isArray(traders) ? traders : []).filter((trader) => trader?.is_active !== false);
}

export default {
  normalizeAssetFocus,
  sanitizeTraderRecord,
  filterVisibleTraders
};

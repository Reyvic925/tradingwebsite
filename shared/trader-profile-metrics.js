export const PROFILE_METRICS = [
  { key: 'current_equity', label: 'Trader equity (USD)', min: 0 },
  { key: 'total_return', label: 'Total return (%)', min: -100 },
  { key: 'win_rate_trades', label: 'Win rate (%)', min: 0, max: 100 },
  { key: 'total_trades', label: 'Total trades', min: 0, integer: true },
  { key: 'max_drawdown', label: 'Maximum drawdown (%)', min: 0, max: 100 },
  { key: 'copiers_current', label: 'Current copiers', min: 0, integer: true },
  { key: 'daily_return', label: 'Daily return (%)', min: -100 },
  { key: 'monthly_return', label: 'Monthly return (%)', min: -100 },
  { key: 'under_management', label: 'Capital following (USD)', min: 0 },
  { key: 'profit_for_copiers', label: 'Copier profit (USD)' },
  { key: 'risk_score', label: 'Profile risk score', min: 1, max: 10, integer: true },
  { key: 'profit_factor', label: 'Profit factor', min: 0 },
  { key: 'average_closed_pnl', label: 'Average closed profit or loss (USD)' },
  { key: 'realized_pnl', label: 'Realized profit or loss (USD)' },
  { key: 'closed_trades_analysed', label: 'Closed trades analysed', min: 0, integer: true },
  { key: 'sharpe', label: 'Sharpe ratio' },
  { key: 'sortino', label: 'Sortino ratio' },
  { key: 'gross_notional', label: 'Gross exposure (USD)', min: 0 },
  { key: 'net_notional', label: 'Net exposure (USD)' },
  { key: 'effective_leverage', label: 'Effective leverage', min: 0 },
  { key: 'return_observations', label: 'Return observations', min: 0, integer: true },
  { key: 'annualization', label: 'Annualization sessions', min: 1, integer: true },
  { key: 'market_trades', label: 'Market-priced trades', min: 0, integer: true },
  { key: 'recorded_trades', label: 'Recorded trade count', min: 0, integer: true },
];

export function normalizeProfileMetrics(input) {
  const values = typeof input === 'string' ? JSON.parse(input) : input;
  if (!values || typeof values !== 'object' || Array.isArray(values)) throw new Error('Profile metrics must be an object.');
  const result = {};
  for (const [key, value] of Object.entries(values)) {
    const spec = PROFILE_METRICS.find(metric => metric.key === key)
      || (/^month_\d{4}_(0[1-9]|1[0-2])$/.test(key) ? { label: key, min: -100 } : null);
    if (!spec) throw new Error(`Unsupported profile metric ${key}.`);
    if (typeof value !== 'number' || !Number.isFinite(value)
      || value < (spec.min ?? -Infinity) || value > (spec.max ?? Infinity)
      || spec.integer && !Number.isSafeInteger(value)) throw new Error(`Invalid value for ${spec.label}.`);
    result[key] = value;
  }
  return result;
}

export function readProfileMetrics(input) {
  try { return normalizeProfileMetrics(input || {}); }
  catch { return {}; }
}

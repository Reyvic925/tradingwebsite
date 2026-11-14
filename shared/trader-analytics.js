const DAY = 86400000;

function adjacentSession(previous, current, crypto) {
  const gap = (Date.parse(current) - Date.parse(previous)) / DAY;
  if (gap === 1) return true;
  if (crypto || gap < 1 || gap > 3) return false;
  for (let offset = 1; offset < gap; offset++) {
    const day = new Date(Date.parse(previous) + offset * DAY).getUTCDay();
    if (day !== 0 && day !== 6) return false;
  }
  return true;
}

function coversBoundary(recorded, boundary, crypto) {
  if (recorded === boundary) return true;
  const gap = (Date.parse(boundary) - Date.parse(recorded)) / DAY;
  if (crypto || gap < 0 || gap > 2) return false;
  for (let offset = 1; offset <= gap; offset++) {
    const day = new Date(Date.parse(recorded) + offset * DAY).getUTCDay();
    if (day !== 0 && day !== 6) return false;
  }
  return true;
}

export function calculateTraderAnalytics(trader, history, now = new Date()) {
  const today = now.toISOString().slice(0, 10);
  const crypto = trader.session_type === 'crypto';
  const snapshots = [...new Map(history.filter(row => Number.isFinite(Number(row.equity)) && Number(row.equity) > 0
    && /^\d{4}-\d{2}-\d{2}$/.test(row.snapshot_date) && Number.isFinite(Date.parse(row.snapshot_date)) && row.snapshot_date <= today)
    .map(row => [row.snapshot_date, row])).values()]
    .sort((a, b) => a.snapshot_date.localeCompare(b.snapshot_date));
  const dailyReturns = [];
  for (let index = 1; index < snapshots.length; index++) {
    if (adjacentSession(snapshots[index - 1].snapshot_date, snapshots[index].snapshot_date, crypto)) {
      dailyReturns.push(snapshots[index].equity / snapshots[index - 1].equity - 1);
    }
  }
  const count = dailyReturns.length;
  const annualization = crypto ? 365 : 252;
  const mean = count ? dailyReturns.reduce((sum, value) => sum + value, 0) / count : 0;
  const variance = count > 1 ? dailyReturns.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (count - 1) : 0;
  const downside = count ? Math.sqrt(dailyReturns.reduce((sum, value) => sum + Math.min(0, value) ** 2, 0) / count) : 0;
  const months = [];
  for (let offset = 11; offset >= 0; offset--) {
    const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - offset, 1));
    const next = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1));
    const month = start.toISOString().slice(0, 7);
    const baselineDate = new Date(start.getTime() - DAY).toISOString().slice(0, 10);
    const end = new Date(Math.min(next.getTime() - DAY, Date.parse(today))).toISOString().slice(0, 10);
    const baseline = snapshots.filter(row => row.snapshot_date <= baselineDate).at(-1);
    const measured = snapshots.filter(row => row.snapshot_date >= start.toISOString().slice(0, 10) && row.snapshot_date <= end);
    const latest = measured.at(-1);
    const covered = baseline && latest && coversBoundary(baseline.snapshot_date, baselineDate, crypto)
      && coversBoundary(latest.snapshot_date, end, crypto);
    months.push({ month, return: covered ? (latest.equity / baseline.equity - 1) * 100 : null,
      partial: month === today.slice(0, 7), observations: measured.length,
      from: baseline?.snapshot_date || null, to: latest?.snapshot_date || null });
  }
  return {
    sharpe: count >= 30 && variance > 0 ? mean / Math.sqrt(variance) * Math.sqrt(annualization) : null,
    sortino: count >= 30 && downside > 0 ? mean / downside * Math.sqrt(annualization) : null,
    annualization, risk_free_rate: 0, target_return: 0, return_observations: count,
    first_snapshot: snapshots[0]?.snapshot_date || null,
    latest_snapshot: snapshots.at(-1)?.snapshot_date || null,
    months,
  };
}

function quoteCurrency(symbol) {
  const pair = /^([A-Z]{3})-([A-Z]{3})$/.exec(symbol);
  if (pair) return pair[2];
  if (['DAX40', 'CAC40'].includes(symbol)) return 'EUR';
  return 'USD';
}

function usdRate(currency, prices) {
  if (currency === 'USD') return 1;
  if (Number(prices[`${currency}-USD`]) > 0) return Number(prices[`${currency}-USD`]);
  if (Number(prices[`USD-${currency}`]) > 0) return 1 / Number(prices[`USD-${currency}`]);
  return null;
}

export function calculateTraderExposure(trader, openTrades, state = {}) {
  const prices = state.prices || {};
  const positions = openTrades.map(trade => {
    const currency = quoteCurrency(trade.symbol);
    const mark = Number(prices[trade.symbol]);
    const sameBasis = trade.price_basis === 'market' ? state.priceBasis === 'market' : state.priceBasis !== 'market';
    const notional = sameBasis && mark > 0 ? Math.abs(Number(trade.quantity) * mark) : null;
    const rate = usdRate(currency, prices);
    return { symbol: trade.symbol, side: trade.side, quantity: Number(trade.quantity), currency,
      mark: notional === null ? null : mark, notional,
      usd_notional: notional !== null && rate !== null ? notional * rate : null };
  });
  const complete = positions.every(position => position.usd_notional !== null);
  const gross = complete ? positions.reduce((sum, position) => sum + position.usd_notional, 0) : null;
  const net = complete ? positions.reduce((sum, position) => sum + position.usd_notional * (position.side === 'BUY' ? 1 : -1), 0) : null;
  return { positions, gross_notional: gross, net_notional: net,
    effective_leverage: gross !== null && trader.current_equity > 0 ? gross / trader.current_equity : null,
    updated_at: state.lastProcessedAt || null,
    allocations: positions.map(position => ({ ...position,
      weight: gross > 0 ? position.usd_notional / gross * 100 : null })),
  };
}

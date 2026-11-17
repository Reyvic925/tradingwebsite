import { positionPnl } from './trading-instruments.js';

// Display estimates use provider ticks. Recorded balances and fills remain in
// the server snapshot, which also supplies the current open quantity.
export function markLivePositions(snapshot, ticks, now = Date.now()) {
  if (!snapshot) return snapshot;
  let changed = false;
  const positions = snapshot.positions.map(position => {
    const tick = ticks[position.symbol];
    const at = Date.parse(tick?.at);
    const recordedAt = Date.parse(position.quote_updated_at);
    if (!tick || !Number.isFinite(tick.price) || tick.price <= 0 || !Number.isFinite(at)
      || now - at > 15000 || at > now + 1000 || at < recordedAt
      || position.quote_currency !== 'USD') return position;
    changed = true;
    return { ...position, current_price: tick.price,
      unrealized_pnl: positionPnl(position, tick.price, position.valuation_version >= 2 ? position.quote_to_usd : 1),
      quote_updated_at: tick.at, price_source: 'Coinbase live ticker', quote_stale: false };
  });
  if (!changed) return snapshot;
  const unrealized = positions.reduce((sum, position) => sum + Number(position.unrealized_pnl || 0), 0);
  return { ...snapshot, positions, account: { ...snapshot.account,
    unrealized_pnl: unrealized, equity: Number(snapshot.account.cash_balance) + unrealized,
    stale_positions: positions.filter(position => position.quote_stale).length } };
}

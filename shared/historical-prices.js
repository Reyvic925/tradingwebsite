export function utcTimestamp(value) {
  if (typeof value !== 'string') throw new Error('A recorded trade timestamp is required.');
  const normalized = /Z$|[+-]\d{2}:?\d{2}$/i.test(value) ? value : `${value.replace(' ', 'T')}Z`;
  const timestamp = Date.parse(normalized);
  if (!Number.isFinite(timestamp)) throw new Error('Invalid recorded trade timestamp.');
  return timestamp;
}

export function historicalReference(bars, timestamp) {
  const at = utcTimestamp(timestamp);
  const day = new Date(at).toISOString().slice(0, 10);
  const sameDay = bars.filter(bar => Number.isFinite(bar.open) && bar.open > 0
    && Number.isFinite(bar.close) && bar.close > 0 && bar.low > 0
    && bar.high >= Math.max(bar.open, bar.close) && bar.low <= Math.min(bar.open, bar.close)
    && bar.at.slice(0, 10) === day && bar.source);
  const active = sameDay.find(bar => Date.parse(bar.at) <= at && at < Date.parse(bar.end));
  if (active) return { price: active.open, at: active.at, end: active.end, source: active.source,
    kind: active.kind, low: active.low, high: active.high, url: active.url };
  // A daily reference is explicitly a reconstruction when no intraday bar covers the timestamp.
  const last = sameDay.sort((a, b) => a.at.localeCompare(b.at)).at(-1);
  if (!last) return null;
  return { price: last.close, at: last.at, end: last.end, source: last.source,
    kind: 'same-day recorded close reference', low: last.low, high: last.high, url: last.url };
}

export function repriceHistoricalTrade(trade, entry, exit, feeBps = 1) {
  if (!entry || (trade.status === 'CLOSED' && !exit)) return null;
  const quantity = Number(trade.quantity);
  if (!Number.isFinite(quantity) || quantity <= 0) throw new Error('Invalid recorded quantity.');
  const fee = quantity * (entry.price + (exit?.price || 0)) * feeBps / 10000;
  const direction = trade.side === 'BUY' ? 1 : -1;
  const pnl = exit ? direction * (exit.price - entry.price) * quantity - fee : -fee;
  const oldEquity = Number(trade.pnl_percent) ? Number(trade.pnl) / Number(trade.pnl_percent) * 100 : null;
  return { entry_price: entry.price, exit_price: exit?.price ?? null, fees: fee,
    pnl, pnl_percent: oldEquity > 0 ? pnl / oldEquity * 100 : null,
    entry, exit, price_basis: 'historical_reference' };
}

export function reconcileHistoricalBook(state, config, corrections, snapshots, valuation) {
  const original = corrections.map(row => row.original);
  const originalClosed = original.filter(row => row.status === 'CLOSED').reduce((sum, row) => sum + Number(row.pnl || 0), 0);
  const position = state.position;
  const originalOpen = position ? (position.side === 'BUY' ? 1 : -1)
    * (Number(state.prices[position.symbol]) - position.entry_price) * position.quantity - position.entry_fee : 0;
  const initialCash = state.equity - originalClosed - originalOpen;
  const feeBps = config.feeBps ?? 1;
  const end = utcTimestamp(state.lastProcessedAt);
  const markAt = (symbol, at) => at === end && state.priceBasis === 'market' && position?.symbol === symbol && state.prices[symbol] > 0
    ? { price: state.prices[symbol] } : valuation(symbol, new Date(at).toISOString());
  const trades = corrections.map(row => ({ ...row.original, ...row.repair }));
  const entryFee = trade => trade.entry_price * trade.quantity * feeBps / 10000;
  const equityAt = at => {
    let equity = initialCash;
    for (const trade of trades) {
      if (utcTimestamp(trade.traded_at) > at) continue;
      if (trade.status === 'CLOSED' && utcTimestamp(trade.closed_at) <= at) equity += Number(trade.pnl || 0);
      else {
        const mark = markAt(trade.symbol, at);
        if (!mark) return null;
        equity += (trade.side === 'BUY' ? 1 : -1) * (mark.price - trade.entry_price) * trade.quantity - entryFee(trade);
      }
    }
    return equity;
  };
  const updatedSnapshots = snapshots.map(snapshot => {
    const at = Math.min(Date.parse(`${snapshot.snapshot_date}T23:59:59.999Z`), end);
    return { ...snapshot, equity: equityAt(at) ?? snapshot.equity };
  });
  const nextState = structuredClone(state);
  const currentEquity = equityAt(end);
  if (currentEquity !== null) nextState.equity = Math.max(0, currentEquity);
  else nextState.equity = Math.max(0, state.equity + trades.filter(row => row.status === 'CLOSED')
    .reduce((sum, row) => sum + Number(row.pnl || 0), 0) - originalClosed);
  for (const correction of corrections.filter(row => row.repair)) {
    const beforeEntry = equityAt(utcTimestamp(correction.original.traded_at));
    if (beforeEntry !== null && beforeEntry + entryFee({ ...correction.original, ...correction.repair }) > 0) {
      correction.repair.pnl_percent = correction.repair.pnl / (beforeEntry + entryFee({ ...correction.original, ...correction.repair })) * 100;
    }
  }
  if (position) {
    const correction = corrections.find(row => row.original.event_id === position.event_id);
    const mark = markAt(position.symbol, end);
    if (correction?.repair && mark) {
      const repair = correction.repair;
      const equityAtEntry = equityAt(utcTimestamp(correction.original.traded_at));
      nextState.position = { ...position, entry_price: repair.entry_price,
        margin: repair.entry_price * position.quantity, notional: repair.entry_price * position.quantity,
        entry_fee: entryFee({ ...correction.original, ...repair }),
        equity_at_entry: equityAtEntry === null ? position.equity_at_entry : equityAtEntry + entryFee({ ...correction.original, ...repair }),
        entry_price_source: `${repair.entry.source} / ${repair.entry.kind}`, entry_quote_at: repair.entry.at,
        price_basis: 'historical_reference' };
      nextState.prices = { [position.symbol]: mark.price };
      nextState.priceBasis = 'market';
      nextState.signals = {};
      repair.pnl = (position.side === 'BUY' ? 1 : -1) * (mark.price - repair.entry_price) * position.quantity - nextState.position.entry_fee;
      repair.pnl_percent = repair.pnl / nextState.position.equity_at_entry * 100;
    }
  } else { nextState.prices = {}; nextState.priceBasis = 'market'; nextState.signals = {}; }
  let peak = initialCash, drawdown = 0;
  const first = Math.min(...original.map(trade => utcTimestamp(trade.traded_at)), end);
  for (let at = first; at <= end; at += 300000) {
    const equity = equityAt(at);
    if (equity === null) continue;
    peak = Math.max(peak, equity);
    if (peak > 0) drawdown = Math.max(drawdown, (peak - equity) / peak * 100);
  }
  nextState.peakEquity = Math.max(peak, nextState.equity);
  nextState.maxDrawdown = drawdown;
  let previous = initialCash;
  for (const snapshot of updatedSnapshots.sort((a, b) => a.snapshot_date.localeCompare(b.snapshot_date))) {
    snapshot.daily_return = previous > 0 ? (snapshot.equity / previous - 1) * 100 : 0;
    previous = snapshot.equity;
  }
  return { state: nextState, snapshots: updatedSnapshots,
    total_return: (nextState.equity / config.startingEquity - 1) * 100 };
}

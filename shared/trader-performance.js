// Trade-derived performance figures shared by the D1 trader analytics route.
// Every value comes from stored rows; nothing here is a configured display target.

function finite(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export function calculateTradePerformance({ trades = [], history = [], startingEquity = 0 } = {}) {
  const closed = trades
    .filter((trade) => String(trade.status).toUpperCase() === 'CLOSED' && finite(trade.pnl) !== null)
    .sort((a, b) => String(a.closed_at || a.traded_at || '').localeCompare(String(b.closed_at || b.traded_at || '')));

  let wins = 0;
  let grossWin = 0;
  let grossLoss = 0;
  let winStreak = 0;
  let lossStreak = 0;
  let longestWinStreak = 0;
  let longestLossStreak = 0;
  for (const trade of closed) {
    const pnl = Number(trade.pnl);
    if (pnl > 0) {
      wins += 1;
      grossWin += pnl;
      winStreak += 1;
      lossStreak = 0;
      longestWinStreak = Math.max(longestWinStreak, winStreak);
    } else {
      grossLoss += Math.abs(pnl);
      lossStreak += 1;
      winStreak = 0;
      longestLossStreak = Math.max(longestLossStreak, lossStreak);
    }
  }

  const snapshots = history
    .map((row) => ({ date: String(row.snapshot_date || row.date || ''), equity: finite(row.equity) }))
    .filter((row) => row.date && row.equity !== null && row.equity > 0)
    .sort((a, b) => a.date.localeCompare(b.date));
  let peak = finite(startingEquity) ?? snapshots[0]?.equity ?? 0;
  let maxDrawdown = 0;
  for (const snapshot of snapshots) {
    peak = Math.max(peak, snapshot.equity);
    if (peak > 0) maxDrawdown = Math.max(maxDrawdown, (peak - snapshot.equity) / peak * 100);
  }
  const finalEquity = snapshots.at(-1)?.equity ?? null;
  const monthsActive = new Set(snapshots.map((row) => row.date.slice(0, 7))).size;

  return {
    closedTrades: closed.length,
    winRate: closed.length ? Number((wins / closed.length * 100).toFixed(2)) : null,
    profitFactor: grossLoss > 0 ? Number((grossWin / grossLoss).toFixed(2)) : null,
    expectancy: closed.length ? Number(((grossWin - grossLoss) / closed.length).toFixed(2)) : null,
    averageWin: wins ? Number((grossWin / wins).toFixed(2)) : null,
    averageLoss: wins < closed.length ? Number((grossLoss / (closed.length - wins)).toFixed(2)) : null,
    longestWinStreak,
    longestLossStreak,
    maxDrawdown: Number(maxDrawdown.toFixed(2)),
    modelledTrades: closed.filter((trade) => Number(trade.modelled) === 1 || trade.price_basis === 'synthetic').length,
    monthsActive,
    firstTrade: closed[0]?.closed_at || closed[0]?.traded_at || null,
    latestTrade: closed.at(-1)?.closed_at || closed.at(-1)?.traded_at || null,
    finalEquity,
    totalReturn: finalEquity !== null && finite(startingEquity) > 0
      ? Number(((finalEquity / Number(startingEquity) - 1) * 100).toFixed(2)) : null,
  };
}

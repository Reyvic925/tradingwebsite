export function calculateSyntheticMetrics({ startingEquity, targetReturnProfile = 0, metricBaseline = {}, trades = [], snapshots = [] }) {
  const closedTrades = trades.filter((trade) => String(trade.status).toUpperCase() === 'CLOSED');
  const currentEquity = snapshots.length
    ? Number(snapshots[snapshots.length - 1].equity)
    : Number(startingEquity);
  const wins = closedTrades.filter((trade) => Number(trade.pnl) > 0).length;
  const baselineTrades = Math.max(0, Math.trunc(Number(metricBaseline.totalTrades) || 0));
  const baselineWinRate = Math.min(100, Math.max(0, Number(metricBaseline.winRate) || 0));
  const baselineWins = Math.round((baselineTrades * baselineWinRate) / 100);
  const totalTrades = baselineTrades + closedTrades.length;
  const returns = snapshots.slice(1).map((snapshot, index) => {
    const previous = Number(snapshots[index].equity);
    const current = Number(snapshot.equity);
    return previous > 0 ? (current - previous) / previous : 0;
  });
  const averageReturn = returns.length ? returns.reduce((sum, value) => sum + value, 0) / returns.length : 0;
  const variance = returns.length
    ? returns.reduce((sum, value) => sum + ((value - averageReturn) ** 2), 0) / returns.length
    : 0;
  let peak = Number(startingEquity);
  let maxDrawdown = 0;
  for (const snapshot of snapshots) {
    const equity = Number(snapshot.equity);
    peak = Math.max(peak, equity);
    if (peak > 0) maxDrawdown = Math.min(maxDrawdown, (equity - peak) / peak);
  }

  const liveReturn = ((currentEquity - Number(startingEquity)) / Number(startingEquity)) * 100;
  const configuredReturn = Math.max(-99.99, Math.min(499.99, Number(targetReturnProfile) || 0));
  const totalReturn = Math.max(-99.99, Math.min(499.99, configuredReturn + liveReturn));
  const maxConfiguredDrawdown = Math.max(0, Number(metricBaseline.maxDrawdown) || 0);

  return {
    current_equity: Number(currentEquity.toFixed(2)),
    total_return: Number(totalReturn.toFixed(2)),
    daily_return: returns.length ? Number((returns[returns.length - 1] * 100).toFixed(2)) : 0,
    total_trades: totalTrades,
    win_rate_trades: totalTrades ? Number((((baselineWins + wins) / totalTrades) * 100).toFixed(2)) : 0,
    max_drawdown: Number(Math.max(maxConfiguredDrawdown, Math.abs(maxDrawdown) * 100).toFixed(2)),
    volatility: Number((Math.sqrt(variance) * 100).toFixed(4)),
  };
}

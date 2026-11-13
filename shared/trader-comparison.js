export function compareHistory(traders, histories, trades, days, now = new Date()) {
  const end = now.toISOString().slice(0, 10);
  const start = new Date(now.getTime() - days * 86400000).toISOString().slice(0, 10);
  const series = traders.map(trader => histories.filter(row => row.trader_id === trader.id)
    .sort((a, b) => a.snapshot_date.localeCompare(b.snapshot_date)));
  const metrics = traders.map((trader, index) => {
    const history = series[index];
    const window = history.filter(row => row.snapshot_date >= start && row.snapshot_date <= end);
    const full = window.length > 1 && window[0].snapshot_date === start && window.at(-1).snapshot_date === end;
    let peak = Number(window[0]?.equity || 0);
    let drawdown = 0;
    for (const row of window) { peak = Math.max(peak, row.equity); if (peak > 0) drawdown = Math.max(drawdown, (peak - row.equity) / peak * 100); }
    return { id: trader.id, name: trader.name,
      return: full && window[0].equity > 0 ? (window.at(-1).equity / window[0].equity - 1) * 100 : null,
      drawdown: full ? drawdown : null,
      trades: trades.filter(row => row.trader_id === trader.id && row.status === 'CLOSED' && String(row.closed_at || row.traded_at).slice(0, 10) >= start).length,
      history_days: history.length ? Math.floor((Date.parse(history.at(-1).snapshot_date) - Date.parse(history[0].snapshot_date)) / 86400000) + 1 : 0 };
  });
  const dates = (series[0] || []).map(row => row.snapshot_date).filter(date => date >= start && date <= end && series.every(rows => rows.some(row => row.snapshot_date === date && row.equity > 0)));
  const baselines = series.map(rows => rows.find(row => row.snapshot_date === dates[0])?.equity);
  const chart = dates.map(date => Object.fromEntries([['date', date], ...traders.map((trader, index) => [String(trader.id), series[index].find(row => row.snapshot_date === date).equity / baselines[index] * 100])]));
  return { metrics, chart };
}

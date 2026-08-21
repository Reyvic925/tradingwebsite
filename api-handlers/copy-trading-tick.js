export function calculateCopyFollowerValue({ currentValue, allocatedAmount, traderChange, riskMultiplier = 1 }) {
  const value = Number(currentValue || 0);
  const allocation = Number(allocatedAmount || 0);
  const exposure = Math.min(5, Math.max(0.25, Number(riskMultiplier) || 1));
  const followerChange = Number(traderChange || 0) * exposure;
  const nextValue = Math.max(0.01, value * (1 + followerChange));
  const pnl = nextValue - allocation;

  return {
    currentValue: Number(nextValue.toFixed(2)),
    pnl: Number(pnl.toFixed(2)),
    pnlPercent: allocation > 0 ? Number(((pnl / allocation) * 100).toFixed(2)) : 0,
    exposure,
  };
}

const money = value => Math.round((value + Number.EPSILON) * 100) / 100;

export function validateCopyRisk(input) {
  const stop = Number(input.stop_loss_percent);
  const target = Number(input.take_profit_percent);
  const multiplier = Number(input.leverage_multiplier);
  if (!Number.isFinite(stop) || stop < 5 || stop > 100) throw new Error('Maximum drawdown must be between 5% and 100%.');
  if (!Number.isFinite(target) || target < 10 || target > 1000) throw new Error('Profit target must be between 10% and 1000%.');
  if (![0.5, 1, 2].includes(multiplier)) throw new Error('Trade multiplier must be 0.5x, 1x, or 2x.');
  return { stop_loss_percent: stop, take_profit_percent: target, leverage_multiplier: multiplier };
}

// Fees apply only to new profits above the previous post-fee high-water mark.
export function valueCopy(follow, change, feePercent = 0) {
  const allocation = Number(follow.allocated_amount);
  const before = Number(follow.current_value);
  const gross = Math.max(0, before * (1 + change * Number(follow.leverage_multiplier)));
  const highWater = Math.max(allocation, Number(follow.fee_high_water || allocation));
  const fee = money(Math.max(0, gross - highWater) * Math.min(100, Math.max(0, feePercent)) / 100);
  const value = money(Math.max(0, gross - fee));
  const peak = Math.max(Number(follow.peak_value || allocation), value);
  const drawdown = peak > 0 ? (peak - value) / peak * 100 : 0;
  const pnl = money(value - allocation);
  const reason = drawdown >= Number(follow.stop_loss_percent) ? 'drawdown_limit'
    : pnl / allocation * 100 >= Number(follow.take_profit_percent) ? 'profit_target' : null;
  return { value, fee, peak, drawdown, pnl, feeHighWater: Math.max(highWater, value), reason };
}

export function calculateInvestmentTick({
  amount,
  totalReturn,
  durationDays,
  previousEarned,
  daysElapsed,
  tickMinutes,
  randomFn = Math.random,
}) {
  const principal = Number(amount || 0);
  const targetEarned = principal * (Number(totalReturn || 0) / 100);
  const duration = Math.max(1, Number(durationDays || 1));
  const elapsed = Math.min(duration, Math.max(0, Number(daysElapsed || 0)));
  const tickDays = Math.max(0, Number(tickMinutes || 5) / (24 * 60));
  const nextElapsed = Math.min(duration, elapsed + tickDays);
  const progress = Math.min(1, nextElapsed / duration);

  const earnedAtProgress = targetEarned * progress;
  const rawIncrement = Math.max(0, earnedAtProgress - (Number(previousEarned || 0)));
  const volatility = (randomFn() - 0.5) * 0.36;
  const incrementWithVolatility = rawIncrement * (1 + volatility);
  const nextEarned = nextElapsed >= duration
    ? targetEarned
    : Math.max(Number(previousEarned || 0), Number(previousEarned || 0) + Math.max(0, incrementWithVolatility));

  return {
    earned: Number(Math.min(targetEarned, nextEarned).toFixed(2)),
    days_elapsed: Number(nextElapsed.toFixed(6)),
    status: nextElapsed >= duration ? 'completed' : 'active',
    progress,
  };
}

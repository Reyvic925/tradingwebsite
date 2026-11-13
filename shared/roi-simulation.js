// ROI calculation algorithm with drift and volatility
export function calculateRoiTick(investment, tier, _configMap = {}, { now = Date.now(), randomFn = Math.random } = {}) {
  const startTime = new Date(investment.start_date).getTime();
  const endTime = new Date(investment.end_date).getTime();

  const elapsedMs = Math.max(0, now - startTime);
  const totalMs = Math.max(1, endTime - startTime);
  const elapsedMinutes = Math.floor(elapsedMs / (1000 * 60));
  const totalMinutes = Math.floor(totalMs / (1000 * 60));
  const minutesLeft = Math.max(0, totalMinutes - elapsedMinutes);

  const amount = Number(investment.amount || 0);
  const currentValue = amount + Number(investment.earned || 0);
  const roiPercent = Number(tier.percent_return ?? 100);
  const volatility = (Number(tier.volatility_max || 10) - Number(tier.volatility_min || 5)) / 2;
  const maxVariation = Number(tier.roi_max || roiPercent + 50) - Number(tier.roi_min || roiPercent - 50);

  // Randomize target ROI within plan's variation range
  const variation = maxVariation * 0.1; // 10% variation band
  const chosenTargetROI = roiPercent + (randomFn() * variation - variation / 2);
  const expectedFinalValue = amount + (amount * chosenTargetROI / 100);

  // Deterministic drift toward target
  const remainingGain = expectedFinalValue - currentValue;
  const intervalsLeft = Math.max(Math.floor(minutesLeft / 5), 1);
  const baseChange = remainingGain / intervalsLeft;

  // Stochastic noise (volatility)
  const volatilityPct = volatility / 100;
  const noise = amount * volatilityPct * (randomFn() * 2 - 1);

  // Combine drift + noise
  let fluctuation = baseChange + noise;

  // Prevent negative value
  if (currentValue + fluctuation <= 0) {
    fluctuation = -currentValue + 0.01;
  }

  // Cap single-step change (default 5% of amount)
  const maxStepPct = 0.05;
  const maxStep = amount * maxStepPct;
  fluctuation = Math.max(Math.min(fluctuation, maxStep), -maxStep);

  // At maturity: gentle correction toward target
  if (minutesLeft <= 5) {
    const diff = expectedFinalValue - currentValue;
    const settleThreshold = amount * 0.02; // 2% threshold
    const maxFinalCorrection = amount * 0.05; // 5% max correction

    if (Math.abs(diff) > settleThreshold) {
      const correction = Math.max(Math.min(diff, maxFinalCorrection), -maxFinalCorrection);
      fluctuation += correction;
    }
  }

  return {
    fluctuation,
    newValue: currentValue + fluctuation,
    isCompleted: minutesLeft <= 0,
    daysElapsed: Math.min(tier.duration_days, Math.floor(elapsedMs / (1000 * 60 * 60 * 24))),
  };
}


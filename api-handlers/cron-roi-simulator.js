import supabase from './db-client.js';

// ROI calculation algorithm with drift and volatility
export function calculateRoiTick(investment, tier, configMap = {}) {
  const now = Date.now();
  const startTime = new Date(investment.start_date).getTime();
  const endTime = new Date(investment.end_date).getTime();

  const elapsedMs = Math.max(0, now - startTime);
  const totalMs = Math.max(1, endTime - startTime);
  const elapsedMinutes = Math.floor(elapsedMs / (1000 * 60));
  const totalMinutes = Math.floor(totalMs / (1000 * 60));
  const minutesLeft = Math.max(0, totalMinutes - elapsedMinutes);

  const amount = Number(investment.amount || 0);
  const currentValue = Number(investment.current_value || amount);
  const roiPercent = Number(tier.percent_return || 100);
  const volatility = (Number(tier.volatility_max || 10) - Number(tier.volatility_min || 5)) / 2;
  const maxVariation = Number(tier.roi_max || roiPercent + 50) - Number(tier.roi_min || roiPercent - 50);

  // Randomize target ROI within plan's variation range
  const variation = maxVariation * 0.1; // 10% variation band
  const chosenTargetROI = roiPercent + (Math.random() * variation - variation / 2);
  const expectedFinalValue = amount + (amount * chosenTargetROI / 100);

  // Deterministic drift toward target
  const remainingGain = expectedFinalValue - currentValue;
  const intervalsLeft = Math.max(Math.floor(minutesLeft / 5), 1);
  const baseChange = remainingGain / intervalsLeft;

  // Stochastic noise (volatility)
  const volatilityPct = volatility / 100;
  const noise = amount * volatilityPct * (Math.random() * 2 - 1);

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

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Cron-Secret');
  if (req.method === 'OPTIONS') return res.status(204).end();

  try {
    const secret = process.env.CRON_SECRET;
    const provided = (req.headers['x-cron-secret'] || req.query?.cron_secret || '').toString();

    if (!secret || provided !== secret) {
      return res.status(401).json({ error: 'Invalid or missing cron secret' });
    }

    // Get all active investments
    const { data: investments } = await supabase.from('investments').select('*').eq('status', 'active');
    if (!investments) return res.status(200).json({ ok: true, updated: 0 });

    // Get all tiers for ROI calculation
    const { data: tiers } = await supabase.from('investment_tiers').select('*');
    const tiersById = Object.fromEntries((tiers || []).map((t) => [t.id, t]));

    // Get config overrides
    const { data: configs } = await supabase.from('config').select('key, value');
    const configMap = Object.fromEntries((configs || []).map((c) => [c.key, c.value]));

    let updated = 0;

    for (const investment of investments) {
      try {
        const tier = tiersById[investment.tier_id];
        if (!tier) continue;

        const tick = calculateRoiTick(investment, tier, configMap);

        // Update investment
        const newValue = Math.max(0.01, tick.newValue);
        const updateData = {
          current_value: newValue,
          days_elapsed: tick.daysElapsed,
          updated_at: new Date().toISOString(),
        };

        if (tick.isCompleted) {
          updateData.status = 'completed';
          updateData.mature_at = new Date().toISOString();
        }

        await supabase.from('investments').update(updateData).eq('id', investment.id);

        // Log transaction
        await supabase.from('investment_transactions').insert({
          investment_id: investment.id,
          user_id: investment.user_id,
          type: tick.fluctuation >= 0 ? 'gain' : 'loss',
          amount: Math.abs(tick.fluctuation),
          description: tick.fluctuation >= 0 ? `Gain of $${Math.abs(tick.fluctuation).toFixed(2)}` : `Loss of $${Math.abs(tick.fluctuation).toFixed(2)}`,
        });

        // Log to user gain logs
        await supabase.from('user_gain_logs').insert({
          user_id: investment.user_id,
          investment_id: investment.id,
          gain_type: 'ROI',
          value: tick.fluctuation,
          message: tick.fluctuation >= 0 ? `Gain of $${Math.abs(tick.fluctuation).toFixed(2)}` : `Loss of $${Math.abs(tick.fluctuation).toFixed(2)}`,
          logged_at: new Date().toISOString(),
        });

        // On completion: move to locked balance
        if (tick.isCompleted) {
          const { data: wallets } = await supabase.from('wallets').select('*').eq('user_id', investment.user_id).limit(1);
          const wallet = wallets?.[0];
          if (wallet) {
            await supabase.from('wallets').update({
              locked_balance: Number(wallet.locked_balance || 0) + newValue,
            }).eq('id', wallet.id);
          }

          // Also update profile locked balance
          const { data: profiles } = await supabase.from('profiles').select('*').eq('user_id', investment.user_id).limit(1);
          const profile = profiles?.[0];
          if (profile) {
            await supabase.from('profiles').update({
              locked_balance: Number(profile.locked_balance || 0) + newValue,
            }).eq('user_id', investment.user_id);
          }
        }

        updated++;
      } catch (err) {
        console.error('[cron-roi] Error processing investment', investment.id, err?.message || err);
      }
    }

    return res.status(200).json({ ok: true, updated, timestamp: new Date().toISOString() });
  } catch (err) {
    console.error('[cron-roi] error', err);
    return res.status(500).json({ error: String(err?.message || err) });
  }
}

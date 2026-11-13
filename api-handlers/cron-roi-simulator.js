import supabase from './db-client.js';

export { calculateRoiTick } from '../shared/roi-simulation.js';
import { calculateRoiTick } from '../shared/roi-simulation.js';

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
    const { data: investments, error: investmentsError } = await supabase
      .from('investments')
      .select('*')
      .eq('status', 'active');
    if (investmentsError) throw investmentsError;
    if (!investments) return res.status(200).json({ ok: true, active: 0, updated: 0, skipped: 0, errors: 0, timestamp: new Date().toISOString() });

    // Investments can originate from the current tier flow or the established
    // plan flow. Normalise both to the same ROI simulation inputs so no active
    // investment is silently skipped.
    const [{ data: tiers }, { data: plans }] = await Promise.all([
      supabase.from('investment_tiers').select('*'),
      supabase.from('plans').select('*'),
    ]);
    const tiersById = Object.fromEntries((tiers || []).map((t) => [t.id, t]));
    const plansById = Object.fromEntries((plans || []).map((plan) => [plan.id, plan]));

    // Get config overrides
    const { data: configs } = await supabase.from('config').select('key, value');
    const configMap = Object.fromEntries((configs || []).map((c) => [c.key, c.value]));

    let updated = 0;
    let skipped = 0;
    let errors = 0;
    const errorMessages = [];

    for (const investment of investments) {
      try {
        const tier = tiersById[investment.tier_id];
        const plan = plansById[investment.plan_id];
        if (tier?.simulation_enabled === false) continue;
        const simulationPlan = tier || (plan && {
          name: plan.name,
          duration_days: plan.duration_days,
          percent_return: plan.total_return,
          roi_min: Number(plan.total_return || 0) * 0.9,
          roi_max: Number(plan.total_return || 0) * 1.1,
          volatility_min: 2,
          volatility_max: 6,
        });
        if (!simulationPlan) {
          skipped++;
          continue;
        }

        const tick = calculateRoiTick(investment, simulationPlan, configMap);

        // Update investment
        const newValue = Math.max(0.01, tick.newValue);
        const updateData = {
          earned: newValue - Number(investment.amount || 0),
          status: tick.isCompleted ? 'completed' : 'active',
        };

        if (tick.isCompleted) {
          updateData.status = 'completed';
        }

        const { data: updatedInvestments, error: updateError } = await supabase
          .from('investments')
          .update(updateData)
          .eq('id', investment.id)
          .eq('status', 'active')
          .select('id');
        if (updateError) throw updateError;
        if (!updatedInvestments?.length) continue;

        const optionalUpdate = {
          days_elapsed: tick.daysElapsed,
          updated_at: new Date().toISOString(),
          ...(tick.isCompleted ? { mature_at: new Date().toISOString() } : {}),
        };
        const { error: optionalUpdateError } = await supabase
          .from('investments')
          .update(optionalUpdate)
          .eq('id', investment.id);
        if (optionalUpdateError) {
          console.warn('[cron-roi] Optional investment fields were not updated:', optionalUpdateError.message || optionalUpdateError);
        }

        // Log transaction
        await supabase.from('investment_transactions').insert({
          investment_id: investment.id,
          user_id: investment.user_id,
          type: tick.fluctuation >= 0 ? 'gain' : 'loss',
          amount: Math.abs(tick.fluctuation),
          description: tick.fluctuation >= 0 ? `ROI gain of $${Math.abs(tick.fluctuation).toFixed(2)}` : `ROI loss of $${Math.abs(tick.fluctuation).toFixed(2)}`,
        });

        // Log to user gain logs
        await supabase.from('user_gain_logs').insert({
          user_id: investment.user_id,
          investment_id: investment.id,
          gain_type: 'ROI',
          value: tick.fluctuation,
          message: tick.fluctuation >= 0 ? `ROI gain of $${Math.abs(tick.fluctuation).toFixed(2)}` : `ROI loss of $${Math.abs(tick.fluctuation).toFixed(2)}`,
          logged_at: new Date().toISOString(),
        });

        // On completion: move to locked balance
        if (tick.isCompleted) {
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
        errors++;
        if (errorMessages.length < 5) errorMessages.push(`investment ${investment.id}: ${String(err?.message || err)}`);
        console.error('[cron-roi] Error processing investment', investment.id, err?.message || err);
      }
    }

    return res.status(200).json({ ok: true, active: investments.length, updated, skipped, errors, errorMessages, timestamp: new Date().toISOString() });
  } catch (err) {
    console.error('[cron-roi] error', err);
    return res.status(500).json({ error: String(err?.message || err) });
  }
}

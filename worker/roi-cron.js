import { calculateRoiTick } from '../shared/roi-simulation.js';
import { seededRandom } from '../api-handlers/synthetic-simulation.js';

export async function runRoiTick(env, now = new Date()) {
  const db = env.DB;
  const tick = Math.floor(now.getTime() / 300000);
  const at = new Date(tick * 300000).toISOString();
  const [{ results: investments }, { results: tiers }, { results: plans }] = await Promise.all([
    db.prepare("SELECT * FROM investments WHERE status='active' AND roi_last_tick < ?").bind(tick).all(),
    db.prepare('SELECT * FROM investment_tiers').all(),
    db.prepare('SELECT * FROM plans').all(),
  ]);
  const tiersById = new Map((tiers || []).map(tier => [tier.id, tier]));
  const plansById = new Map((plans || []).map(plan => [plan.id, plan]));
  const summary = { active: investments?.length || 0, updated: 0, skipped: 0, completed: 0, errors: 0, timestamp: at };
  for (const investment of investments || []) {
    try {
      const tier = tiersById.get(investment.tier_id);
      const plan = plansById.get(investment.plan_id);
      if (tier && !tier.simulation_enabled) { summary.skipped++; continue; }
      const product = tier || (plan && { ...plan, percent_return: plan.total_return,
        roi_min: Number(plan.total_return) * 0.9, roi_max: Number(plan.total_return) * 1.1, volatility_min: 2, volatility_max: 6 });
      const start = Date.parse(investment.start_date);
      const end = Date.parse(investment.end_date);
      if (!product || !Number.isFinite(start) || !Number.isFinite(end) || end <= start || start > tick * 300000 || !Number.isFinite(Number(product.percent_return)) || Number(investment.amount) <= 0) {
        summary.skipped++; continue;
      }
      const result = calculateRoiTick(investment, product, {}, { now: tick * 300000, randomFn: seededRandom(`roi:${investment.id}:${tick}`) });
      const value = Math.round(Math.max(0.01, result.newValue) * 100) / 100;
      const earned = Math.round((value - investment.amount) * 100) / 100;
      const delta = Math.round((earned - investment.earned) * 100) / 100;
      const status = result.isCompleted ? 'completed' : 'active';
      if (status === 'completed' && !(await db.prepare('SELECT user_id FROM profiles WHERE user_id=?').bind(investment.user_id).first())) {
        summary.errors++; continue;
      }
      const operation = crypto.randomUUID();
      const results = await db.batch([
        db.prepare(`UPDATE investments SET earned=?,current_value=?,days_elapsed=?,status=?,
          mature_at=CASE WHEN ?='completed' THEN ? ELSE mature_at END,updated_at=?,roi_last_tick=?
          WHERE id=? AND status='active' AND roi_last_tick < ? AND earned=?`)
          .bind(earned, value, result.daysElapsed, status, status, at, at, tick, investment.id, tick, investment.earned),
        db.prepare(`INSERT INTO investment_roi_ticks (investment_id,tick,operation_id,earned_before,earned_after,value_after,status,created_at)
          SELECT ?,?,?,?,?,?,?,? WHERE changes()=1`)
          .bind(investment.id, tick, operation, investment.earned, earned, value, status, at),
        db.prepare(`INSERT INTO investment_transactions (investment_id,user_id,type,amount,description)
          SELECT investment_id,?,?,?,? FROM investment_roi_ticks WHERE operation_id=?`)
          .bind(investment.user_id, delta >= 0 ? 'gain' : 'loss', Math.abs(delta), `ROI ${delta >= 0 ? 'gain' : 'loss'} of $${Math.abs(delta).toFixed(2)}`, operation),
        db.prepare(`UPDATE profiles SET locked_balance=round(locked_balance + ?,2)
          WHERE user_id=? AND EXISTS (SELECT 1 FROM investment_roi_ticks WHERE operation_id=? AND status='completed')`)
          .bind(value, investment.user_id, operation),
        db.prepare(`INSERT INTO notifications (user_id,title,body,read)
          SELECT ?,'Investment matured',?,0 FROM investment_roi_ticks WHERE operation_id=? AND status='completed'`)
          .bind(investment.user_id, 'Your investment has matured. Its final value is available in your locked balance.', operation),
      ]);
      if (results[0].meta?.changes) { summary.updated++; if (status === 'completed') summary.completed++; }
    } catch (error) {
      summary.errors++;
      console.error('[roi-cron] Investment processing failed', investment.id, error);
    }
  }
  if (summary.errors) throw new Error(`ROI processing failed for ${summary.errors} investment(s).`);
  return summary;
}

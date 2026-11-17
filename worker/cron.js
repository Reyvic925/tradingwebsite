import { runCopyTradingTick } from './copy-trading.js';
import { runRoiTick } from './roi-cron.js';

const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store', 'referrer-policy': 'no-referrer' } });
const jobs = { 'copy-trading': runCopyTradingTick, roi: runRoiTick };

async function sameSecret(a, b) {
  const encoder = new TextEncoder();
  const [left, right] = await Promise.all([a, b].map(value => crypto.subtle.digest('SHA-256', encoder.encode(value))));
  const x = new Uint8Array(left), y = new Uint8Array(right);
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
  return diff === 0;
}

export async function runCronJob(job, env, now = new Date()) {
  const runner = jobs[job];
  if (!runner) throw new Error('Unknown cron job');
  const db = env.DB;
  const cadenceMs = job === 'copy-trading' ? 60000 : 300000;
  const tick = Math.floor(now.getTime() / cadenceMs);
  const at = now.toISOString();
  await db.prepare('INSERT OR IGNORE INTO cron_job_state (job) VALUES (?)').bind(job).run();
  const token = crypto.randomUUID();
  const acquired = await db.prepare(`UPDATE cron_job_state SET lock_token=?,lease_until=?,last_started_at=?,last_status='running'
    WHERE job=? AND lease_until <= ? AND last_tick < ?`).bind(token, now.getTime() + 300000, at, job, now.getTime(), tick).run();
  if (!acquired.meta?.changes) return { ok: true, job, tick, skipped: true, reason: 'already_processed_or_running' };
  try {
    const result = await runner(env, now);
    await db.prepare(`UPDATE cron_job_state SET lock_token=NULL,lease_until=0,last_finished_at=?,last_status='success',last_result=?,last_tick=?
      WHERE job=? AND lock_token=?`).bind(new Date().toISOString(), JSON.stringify(result || {}), tick, job, token).run();
    console.log('[cron] completed', job, tick);
    return { ok: true, job, tick, result: result || {}, timestamp: at };
  } catch (error) {
    await db.prepare(`UPDATE cron_job_state SET lock_token=NULL,lease_until=0,last_finished_at=?,last_status='error',last_result=?
      WHERE job=? AND lock_token=?`).bind(new Date().toISOString(), JSON.stringify({ error: 'Job failed; see Worker logs.' }), job, token).run();
    console.error('[cron] failed', job, error);
    throw error;
  }
}

export async function handleCronRequest(request, env) {
  const url = new URL(request.url);
  if (!['GET', 'POST'].includes(request.method)) return json({ error: 'Method not allowed' }, 405);
  if (!env.CRON_SECRET) return json({ error: 'Cron authentication is not configured.' }, 503);
  const provided = request.headers.get('x-cron-secret') || request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') || url.searchParams.get('cron_secret') || '';
  if (!provided || provided.length > 1024 || !(await sameSecret(provided, String(env.CRON_SECRET)))) return json({ error: 'Invalid or missing cron secret' }, 401);
  const job = url.pathname.slice('/api/cron/'.length);
  if (!jobs[job] && job !== 'status') return json({ error: 'Cron job not found' }, 404);
  try {
    if (job === 'status' || url.searchParams.get('dry_run') === '1') {
      const { results } = await env.DB.prepare('SELECT job,last_started_at,last_finished_at,last_status,last_tick,last_result FROM cron_job_state ORDER BY job').all();
      return json({ ok: true, jobs: (results || []).map(row => ({ ...row,
        cadence_minutes: row.job === 'copy-trading' ? 1 : 5 })), cadence_minutes: job === 'copy-trading' ? 1 : 5 });
    }
    return json(await runCronJob(job, env));
  } catch {
    return json({ error: 'Cron job failed. Check Worker logs.' }, 503);
  }
}

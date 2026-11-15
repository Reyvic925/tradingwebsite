import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { runCronJob, handleCronRequest } from '../../worker/cron.js';
import { runRoiTick } from '../../worker/roi-cron.js';
import worker from '../../worker/index.js';

const sqlite = new DatabaseSync(':memory:');
for (const file of ['0001_d1_foundation.sql','0003_user_activity.sql','0008_investment_ledger.sql','0018_traders.sql','0020_copy_trading.sql','0021_roi_cron.sql','0025_copy_trade_quote_provenance.sql','0027_trade_price_audit.sql']) sqlite.exec(readFileSync(`d1-migrations/${file}`, 'utf8'));
let failBatch = false;
class Statement {
  constructor(sql) { this.sql = sql; this.values = []; }
  bind(...values) { this.values = values; return this; }
  async first() { return sqlite.prepare(this.sql).get(...this.values) || null; }
  async all() { return { results: sqlite.prepare(this.sql).all(...this.values) }; }
  async run() { return { meta: { changes: Number(sqlite.prepare(this.sql).run(...this.values).changes) } }; }
}
const db = { prepare: sql => new Statement(sql), async batch(statements) {
  sqlite.exec('BEGIN');
  try {
    const results = [];
    for (let i = 0; i < statements.length; i++) {
      results.push(await statements[i].run());
      if (failBatch && i === 2) { failBatch = false; throw new Error('Injected transaction failure'); }
    }
    sqlite.exec('COMMIT'); return results;
  } catch (error) { sqlite.exec('ROLLBACK'); throw error; }
} };
const env = { DB: db, CRON_SECRET: 'test-only-secret' };
const now = new Date(Math.floor(Date.now() / 300000) * 300000);
const date = offset => new Date(+now + offset * 86400000).toISOString();
sqlite.exec("INSERT INTO auth_users(id,email,password_hash,email_verified_at) VALUES ('u','test@example.test','unused','2026-01-01'); INSERT INTO profiles(user_id,locked_balance) VALUES ('u',100)");
sqlite.exec("INSERT INTO investment_tiers(id,name,tier_level,percent_return,duration_days,min_investment,max_investment,simulation_enabled) VALUES (1,'Enabled',1,20,7,100,10000,1),(2,'Disabled',2,30,7,100,10000,0)");
sqlite.exec("INSERT INTO plans(id,name,duration_days,total_return) VALUES (1,'Plan',7,15)");
const insert = sqlite.prepare(`INSERT INTO investments (id,user_id,tier_id,plan_id,amount,earned,start_date,end_date,duration_days) VALUES (?,'u',?,?,1000,0,?,?,7)`);
insert.run(1, 1, null, date(-1), date(6));
insert.run(2, 1, null, date(-8), date(-1));
insert.run(3, 2, null, date(-1), date(6));
insert.run(4, null, 1, date(-1), date(6));
insert.run(5, 1, null, date(1), date(8));
const job = await runCronJob('roi', env, now);
assert.equal(job.ok, true);
assert.equal(job.result.updated, 3);
assert.equal(job.result.completed, 1);
assert.equal(job.result.skipped, 2);
const matured = sqlite.prepare('SELECT * FROM investments WHERE id=2').get();
const locked = sqlite.prepare('SELECT locked_balance FROM profiles').get().locked_balance;
assert.equal(matured.status, 'completed');
assert.equal(locked, Math.round((100 + matured.current_value) * 100) / 100);
assert.equal(sqlite.prepare('SELECT count(*) n FROM investment_roi_ticks').get().n, 3);
assert.equal(sqlite.prepare('SELECT count(*) n FROM investment_transactions').get().n, 3);
const retry = await runCronJob('roi', env, now);
assert.equal(retry.skipped, true);
await runRoiTick(env, now);
assert.equal(sqlite.prepare('SELECT count(*) n FROM investment_transactions').get().n, 3);
assert.equal(sqlite.prepare('SELECT locked_balance FROM profiles').get().locked_balance, locked);
await runRoiTick(env, new Date(+now + 300000));
assert.equal(sqlite.prepare('SELECT locked_balance FROM profiles').get().locked_balance, locked, 'later ticks cannot repay completed investments');
assert.equal(sqlite.prepare('SELECT earned FROM investments WHERE id=3').get().earned, 0);
assert.equal(sqlite.prepare('SELECT earned FROM investments WHERE id=5').get().earned, 0);

const ledgerBefore = sqlite.prepare('SELECT count(*) n FROM investment_roi_ticks').get().n;
const investmentBefore = sqlite.prepare('SELECT * FROM investments WHERE id=1').get();
failBatch = true;
await assert.rejects(() => runRoiTick(env, new Date(+now + 600000)), /processing failed/);
const investmentAfter = sqlite.prepare('SELECT * FROM investments WHERE id=1').get();
assert.equal(investmentAfter.earned, investmentBefore.earned, 'failed tick rolls back investment update');
assert.equal(investmentAfter.roi_last_tick, investmentBefore.roi_last_tick);
await runRoiTick(env, new Date(+now + 600000));
assert.equal(sqlite.prepare('SELECT count(*) n FROM investment_roi_ticks WHERE investment_id=1').get().n, 3);
assert(sqlite.prepare('SELECT count(*) n FROM investment_roi_ticks').get().n > ledgerBefore);

const request = (path, headers = {}, method = 'GET') => new Request(`https://example.test/api/cron/${path}`, { headers, method });
assert.equal((await handleCronRequest(request('roi'), env)).status, 401);
assert.equal((await handleCronRequest(request('roi?cron_secret=wrong'), env)).status, 401);
assert.equal((await handleCronRequest(request('roi'), { DB: db })).status, 503);
assert.equal((await handleCronRequest(request('roi', {}, 'DELETE'), env)).status, 405);
assert.equal((await handleCronRequest(request('unknown', { 'x-cron-secret': env.CRON_SECRET }), env)).status, 404);
const status = await worker.fetch(request('status', { authorization: `Bearer ${env.CRON_SECRET}` }), env);
assert.equal(status.status, 200);
assert.equal((await status.json()).jobs[0].last_status, 'success');
assert.equal((await worker.fetch(request('roi?cron_secret=test-only-secret&dry_run=1'), env)).status, 200);
const originalFetch = globalThis.fetch;
globalThis.fetch = async () => { throw new Error('Fixture provider unavailable'); };
const httpCopy = await worker.fetch(request('copy-trading', { 'x-cron-secret': env.CRON_SECRET }, 'POST'), env);
assert.equal(httpCopy.status, 200, await httpCopy.clone().text());
assert.equal((await httpCopy.json()).job, 'copy-trading');
globalThis.fetch = originalFetch;
assert.equal((await worker.fetch(request('roi', { 'x-cron-secret': env.CRON_SECRET }), env)).status, 200);
sqlite.close();
console.log('WORKER_CRON_TESTS_PASSED');

import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import ts from 'typescript';
import { renderToStaticMarkup } from 'react-dom/server';
import React from 'react';
import { handleTraderRequest } from '../../worker/traders-api.js';
import { normalizeProfileMetrics, readProfileMetrics } from '../../shared/trader-profile-metrics.js';

assert.deepEqual(normalizeProfileMetrics({ total_return: 0, win_rate_trades: 75, month_2026_11: 2.5 }),
  { total_return: 0, win_rate_trades: 75, month_2026_11: 2.5 });
for (const value of [{ win_rate_trades: 101 }, { copiers_current: 1.5 }, { risk_score: 0 },
  { gross_notional: -1 }, { sharpe: Infinity }, { total_return: '20' }, { unknown: 4 },
  { month_2026_13: 1 }, [], null]) assert.throws(() => normalizeProfileMetrics(value));
assert.deepEqual(readProfileMetrics('invalid JSON'), {});

const sqlite = new DatabaseSync(':memory:');
for (const file of ['0001_d1_foundation.sql', '0018_traders.sql', '0035_trader_profile_metrics.sql']) {
  sqlite.exec(readFileSync(`d1-migrations/${file}`, 'utf8'));
}
class Statement {
  constructor(sql) { this.sql = sql; this.args = []; }
  bind(...args) { this.args = args; return this; }
  async first() { return sqlite.prepare(this.sql).get(...this.args) || null; }
  async all() { return { results: sqlite.prepare(this.sql).all(...this.args) }; }
  async run() { return { meta: { changes: Number(sqlite.prepare(this.sql).run(...this.args).changes) } }; }
}
const env = { DB: { prepare: sql => new Statement(sql) }, ADMIN_EMAILS: 'admin@example.test' };
sqlite.exec("INSERT INTO auth_users(id,email,password_hash,email_verified_at) VALUES ('admin','admin@example.test','unused',CURRENT_TIMESTAMP),('viewer','viewer@example.test','unused',CURRENT_TIMESTAMP)");
sqlite.exec("INSERT INTO profiles(user_id,email,role) VALUES ('admin','admin@example.test','admin'),('viewer','viewer@example.test','user')");
for (const user of ['admin', 'viewer']) sqlite.prepare('INSERT INTO auth_sessions(id,user_id,expires_at) VALUES (?,?,?)')
  .run(createHash('sha256').update(user).digest('base64url'), user, '2099-01-01');
const call = (method, body, token = 'admin', query = '?id=4') => handleTraderRequest(new Request(`https://example.test/api/traders${query}`, {
  method, headers: { 'content-type': 'application/json', cookie: `apex_session=${token}` },
  ...(body === undefined ? {} : { body: JSON.stringify(body) }),
}), env);
assert.equal((await call('PUT', { profile_metrics: { total_return: 50 } }, 'viewer')).status, 403);
assert.equal((await call('PUT', { profile_metrics: { win_rate_trades: -1 } })).status, 400);
assert.equal((await call('PUT', { profit_sharing_fee: 101 })).status, 400);
const before = sqlite.prepare('SELECT total_return FROM traders WHERE id=4').get().total_return;
const updated = await call('PUT', { profile_metrics: { total_return: 50, copiers_current: 12, sharpe: 1.4, month_2026_11: 3.2 }, profit_sharing_fee: 15 });
assert.equal(updated.status, 200, await updated.clone().text());
const saved = await updated.json();
assert.equal(saved.total_return, before, 'Reported values must remain separate from recorded performance');
assert.equal(saved.profile_metrics.total_return, 50);
assert(saved.profile_metrics_updated_at);
assert.equal(saved.profit_sharing_fee, 15, 'The fee editor must update the operational fee');
assert.equal(sqlite.prepare('SELECT count(*) count FROM trader_profile_metric_audit WHERE trader_id=4').get().count, 1);
sqlite.prepare('UPDATE traders SET total_return=? WHERE id=4').run(-2.5);
const fetched = (await (await call('GET')).json())[0];
assert.equal(fetched.total_return, -2.5);
assert.equal(fetched.profile_metrics.total_return, 50, 'Trading updates must preserve reported values');
sqlite.prepare('UPDATE traders SET profile_metrics=? WHERE id=4').run(JSON.stringify({ total_return: 0 }));
assert.deepEqual((await (await call('GET')).json())[0].profile_metrics, { total_return: 0 });
assert.equal(sqlite.prepare('SELECT count(*) count FROM trader_profile_metric_audit WHERE trader_id=4').get().count, 2, 'Direct D1 edits must be audited');
assert.equal((await call('PUT', { profile_metrics: {} })).status, 200);
assert.deepEqual((await (await call('GET')).json())[0].profile_metrics, {});
const created = await call('POST', { name: 'Reported strategy', profile_metrics: { total_return: 5 } }, 'admin', '');
assert.equal(created.status, 201, await created.clone().text());
assert((await created.json()).profile_metrics_updated_at);
sqlite.close();

// Verify the public label and zero-value handling through the rendered component.
const source = readFileSync('src/components/ProfileMetric.tsx', 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText;
const exports = {};
vm.runInNewContext(compiled, { exports, require: createRequire(import.meta.url) });
const html = renderToStaticMarkup(React.createElement(exports.default, {
  trader: { profile_metrics: { total_return: 0 } }, metricKey: 'total_return', children: 'Recorded 20%',
}));
assert.match(html, /Admin-reported/);
assert.match(html, />0</);
assert.doesNotMatch(html, /Recorded 20/);
const recorded = renderToStaticMarkup(React.createElement(exports.default, { trader: {}, metricKey: 'total_return', children: 'Recorded 20%' }));
assert.equal(recorded, 'Recorded 20%');
console.log('TRADER_PROFILE_METRICS_TESTS_PASSED');

import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { calculateTraderAnalytics, calculateTraderExposure } from '../../shared/trader-analytics.js';
import { handleTraderRequest } from '../../worker/traders-api.js';
import { valueCopy } from '../../shared/copy-risk.js';
import { calculateTradePerformance } from '../../shared/trader-performance.js';

const fragile = calculateTradePerformance({ trades: [
  { status: 'CLOSED', pnl: 1172.51, closed_at: '2026-01-02', modelled: 1 },
  { status: 'CLOSED', pnl: -3233.19, closed_at: '2026-01-03', modelled: 1 },
] });
assert(Math.abs(fragile.breakevenWinRate - 73.39) < 0.01);
assert.equal(calculateTradePerformance({ trades: [{ status: 'CLOSED', pnl: 10 }] }).breakevenWinRate, null);

const trader = { session_type: 'crypto', current_equity: 10000 };
let equity = 10000;
const history = [{ snapshot_date: '2026-09-30', equity }];
for (let day = 1; day <= 31; day++) {
  equity *= day % 2 ? 1.01 : 0.995;
  history.push({ snapshot_date: `2026-10-${String(day).padStart(2, '0')}`, equity });
}
const now = new Date('2026-11-14T12:00:00Z');
const analytics = calculateTraderAnalytics(trader, history, now);
assert.equal(analytics.return_observations, 31);
assert(Number.isFinite(analytics.sharpe));
assert(Number.isFinite(analytics.sortino));
const expectedMean = (16 * 0.01 - 15 * 0.005) / 31;
const expectedVariance = (16 * (0.01 - expectedMean) ** 2 + 15 * (-0.005 - expectedMean) ** 2) / 30;
assert(Math.abs(analytics.sharpe - expectedMean / Math.sqrt(expectedVariance) * Math.sqrt(365)) < 1e-9);
const october = analytics.months.find(month => month.month === '2026-10');
assert(Math.abs(october.return - (equity / 10000 - 1) * 100) < 1e-9);
assert.equal(october.partial, false);
assert.equal(analytics.months.find(month => month.month === '2026-11').return, null);
assert.equal(calculateTraderAnalytics(trader, history.slice(0, 20), now).sharpe, null);
assert.equal(calculateTraderAnalytics(trader, history.slice(1), now).months.find(month => month.month === '2026-10').return, null);
assert.equal(calculateTraderAnalytics(trader, [history[0], history[31]], now).return_observations, 0);
const fridayMonday = [{ snapshot_date: '2026-11-06', equity: 100 }, { snapshot_date: '2026-11-09', equity: 101 }];
assert.equal(calculateTraderAnalytics({ session_type: 'london' }, fridayMonday, now).return_observations, 1);
assert.equal(calculateTraderAnalytics(trader, fridayMonday, now).return_observations, 0);

const state = { priceBasis: 'market', prices: { 'BTC-USD': 100000, 'USD-JPY': 150 } };
const exposure = calculateTraderExposure(trader, [
  { symbol: 'BTC-USD', side: 'BUY', quantity: 0.05, price_basis: 'market' },
  { symbol: 'USD-JPY', side: 'SELL', quantity: 1000, price_basis: 'market' },
], state);
assert.equal(exposure.gross_notional, 6000);
assert.equal(exposure.net_notional, 4000);
assert.equal(exposure.effective_leverage, 0.6);
assert.equal(calculateTraderExposure(trader, [{ symbol: 'EUR-GBP', side: 'BUY', quantity: 100, price_basis: 'market' }], state).gross_notional, null);
assert.equal(calculateTraderExposure(trader, [{ symbol: 'BTC-USD', side: 'BUY', quantity: 1, price_basis: 'synthetic' }], state).gross_notional, null);
assert.equal(calculateTraderExposure(trader, [], state).effective_leverage, 0);
const preview = valueCopy({ allocated_amount: 1000, current_value: 1000, peak_value: 1000,
  leverage_multiplier: 2, fee_high_water: 1000, stop_loss_percent: 20, take_profit_percent: 200 }, 0.1, 20);
assert.equal(preview.fee, 40);
assert.equal(preview.value, 1160);

const sqlite = new DatabaseSync(':memory:');
for (const file of ['0001_d1_foundation.sql', '0018_traders.sql', '0020_copy_trading.sql', '0025_copy_trade_quote_provenance.sql','0027_trade_price_audit.sql','0029_recorded_performance_baselines.sql', '0026_trader_watchlists.sql','0041_modelled_trader_history.sql']) {
  sqlite.exec(readFileSync(`d1-migrations/${file}`, 'utf8'));
}
class Statement {
  constructor(sql) { this.sql = sql; this.values = []; }
  bind(...values) { this.values = values; return this; }
  async first() { return sqlite.prepare(this.sql).get(...this.values) || null; }
  async all() { return { results: sqlite.prepare(this.sql).all(...this.values) }; }
  async run() { return { meta: { changes: sqlite.prepare(this.sql).run(...this.values).changes } }; }
}
const env = { DB: { prepare: sql => new Statement(sql) } };
for (const id of ['first', 'second']) {
  sqlite.prepare('INSERT INTO auth_users(id,email,password_hash,email_verified_at) VALUES (?,?,?,CURRENT_TIMESTAMP)').run(id, `${id}@example.test`, 'unused');
  sqlite.prepare('INSERT INTO auth_sessions(id,user_id,expires_at) VALUES (?,?,?)')
    .run(createHash('sha256').update(id).digest('base64url'), id, '2099-01-01');
}
const request = (path, method = 'GET', user = 'first') => handleTraderRequest(new Request(`https://example.test${path}`,
  { method, headers: user ? { cookie: `apex_session=${user}` } : {} }), env);
assert.equal((await request('/api/trader-watchlist', 'GET', '')).status, 401);
assert.equal((await request('/api/trader-watchlist?traderId=1', 'PUT')).status, 200);
assert.equal((await request('/api/trader-watchlist?traderId=1', 'PUT')).status, 200);
assert.deepEqual((await (await request('/api/trader-watchlist')).json()).trader_ids, [1]);
assert.deepEqual((await (await request('/api/trader-watchlist', 'GET', 'second')).json()).trader_ids, []);
await request('/api/trader-watchlist?traderId=1', 'DELETE', 'second');
assert.deepEqual((await (await request('/api/trader-watchlist')).json()).trader_ids, [1]);
assert.equal((await request('/api/trader-watchlist?traderId=9999', 'PUT')).status, 404);
assert.equal((await request('/api/trader-watchlist?traderId=invalid', 'PUT')).status, 400);
await request('/api/trader-watchlist?traderId=1', 'DELETE');
assert.deepEqual((await (await request('/api/trader-watchlist')).json()).trader_ids, []);
sqlite.prepare("INSERT INTO trader_trades (trader_id,symbol,side,quantity,entry_price,exit_price,pnl,pnl_percent,status,traded_at,closed_at,price_basis,modelled) VALUES (1,'BTC-USD','BUY',1,100,110,10,10,'CLOSED','2026-11-01T00:00:00Z','2026-11-02T00:00:00Z','synthetic',1)").run();
const response = await request('/api/trader-analytics?traderId=1');
assert.equal(response.status, 200);
const withTrade = await response.json();
assert.equal(withTrade.performance.closedTrades, 1);
assert.equal(withTrade.performance.winRate, 100);
assert.equal(withTrade.performance.profitFactor, null);
assert.equal(withTrade.performance.modelledTrades, 1);
const activity = await (await request('/api/trader-trades?traderId=1')).json();
assert.equal(activity[0].entry_price, 100);
assert.equal(activity[0].pnl, 10);
assert.equal(activity[0].modelled, 1);
assert.equal(withTrade.sharpe, null);
assert.equal(withTrade.months.length, 12);
assert.equal(withTrade.exposure.gross_notional, 0);
assert.equal(withTrade.live.closedTrades, 0);
sqlite.prepare("INSERT INTO trader_trades (trader_id,symbol,side,quantity,entry_price,exit_price,pnl,pnl_percent,status,traded_at,closed_at,price_basis,modelled) VALUES (1,'ETH-USD','BUY',1,100,105,5,5,'CLOSED','2026-11-20T00:00:00Z','2026-11-21T00:00:00Z','market',0)").run();
const withLive = await (await request('/api/trader-analytics?traderId=1')).json();
assert.equal(withLive.live.closedTrades, 1);
assert.equal(withLive.live.realizedPnl, 5);
assert.equal(withLive.live.winRate, 100);
assert.equal(withLive.live.quoteBackedTrades, 1);
assert.equal(withLive.performance.closedTrades, 2);
assert.equal(withLive.performance.modelledTrades, 1);
assert.equal((await request('/api/trader-analytics?traderId=9999')).status, 404);
assert.equal((await request('/api/trader-comparison?ids=&period=30')).status, 400);
const comparison = await (await request('/api/trader-comparison?ids=1,2&period=30')).json();
assert.equal(comparison.metrics.length, 2);
assert.equal(comparison.metrics[0].performance_fee, 20);
sqlite.close();
console.log('TRADER_ANALYTICS_AND_WATCHLIST_TESTS_PASSED');

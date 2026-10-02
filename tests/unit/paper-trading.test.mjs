import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { handlePaperTradingRequest } from '../../worker/paper-trading.js';

class SqliteStatement {
  constructor(db, sql) {
    this.db = db;
    this.sql = sql;
    this.values = [];
  }

  bind(...values) {
    this.values = values;
    return this;
  }

  async first() {
    return this.db.prepare(this.sql).get(...this.values) || null;
  }

  async all() {
    return { results: this.db.prepare(this.sql).all(...this.values) };
  }

  async run() {
    const result = this.db.prepare(this.sql).run(...this.values);
    return { success: true, meta: { changes: Number(result.changes), last_row_id: Number(result.lastInsertRowid || 0) } };
  }
}

class D1TestDatabase {
  constructor() {
    this.sqlite = new DatabaseSync(':memory:');
    this.sqlite.exec('PRAGMA foreign_keys = ON');
    this.sqlite.exec(`
      CREATE TABLE auth_users (id TEXT PRIMARY KEY, email TEXT, created_at TEXT, email_verified_at TEXT);
      CREATE TABLE auth_sessions (id TEXT PRIMARY KEY, user_id TEXT, expires_at TEXT);
      CREATE TABLE markets (id INTEGER PRIMARY KEY, symbol TEXT, name TEXT, asset_class TEXT,
        price REAL, change_24h REAL, volume REAL, high_24h REAL, low_24h REAL);
    `);
    this.sqlite.exec(readFileSync(new URL('../../d1-migrations/0017_paper_trading_ledger.sql', import.meta.url), 'utf8'));
  }

  prepare(sql) {
    return new SqliteStatement(this.sqlite, sql);
  }

  async batch(statements) {
    this.sqlite.exec('BEGIN');
    try {
      const results = [];
      for (const statement of statements) results.push(await statement.run());
      this.sqlite.exec('COMMIT');
      return results;
    } catch (error) {
      this.sqlite.exec('ROLLBACK');
      throw error;
    }
  }
}

const db = new D1TestDatabase();
const userIds = ['paper-user-a', 'paper-user-b'];
for (const userId of userIds) {
  db.sqlite.prepare(`INSERT INTO auth_users (id, email, created_at, email_verified_at) VALUES (?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`)
    .run(userId, `${userId}@example.test`);
}
db.sqlite.prepare('INSERT INTO markets (id, symbol, name, asset_class, price) VALUES (1, ?, ?, ?, ?)')
  .run('BTCUSD', 'Bitcoin / USD', 'crypto', 100);

const sessionTokens = new Map();
for (const userId of userIds) {
  const token = `session-${userId}`;
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
  const hash = btoa(String.fromCharCode(...new Uint8Array(digest)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
  sessionTokens.set(userId, token);
  db.sqlite.prepare("INSERT INTO auth_sessions (id, user_id, expires_at) VALUES (?, ?, datetime('now', '+1 day'))")
    .run(hash, userId);
}

let quotePrice = 100;
let logicalNow = Date.now();
const originalDateNow = Date.now;
const originalFetch = globalThis.fetch;
Date.now = () => logicalNow;
globalThis.fetch = async (url) => {
  assert.match(url, /api\.coinpaprika\.com\/v1\/tickers\/btc-bitcoin/);
  return Response.json({
    quotes: { USD: { price: quotePrice, percent_change_24h: 0, volume_24h: 5000 } },
    last_updated: new Date(logicalNow).toISOString(),
  });
};

const env = { DB: db };
const request = (path, userId, method = 'GET', body) => new Request(`https://app.test${path}`, {
  method,
  headers: {
    cookie: `apex_session=${sessionTokens.get(userId)}`,
    ...(body ? { 'content-type': 'application/json' } : {}),
  },
  ...(body ? { body: JSON.stringify(body) } : {}),
});

try {
  const accountA = await (await handlePaperTradingRequest(request('/api/paper/account', userIds[0]), env)).json();
  const accountB = await (await handlePaperTradingRequest(request('/api/paper/account', userIds[1]), env)).json();
  assert.equal(accountA.initial_cash, 100000);
  assert.equal(accountB.initial_cash, 100000);

  const marketBuy = await handlePaperTradingRequest(request('/api/paper/orders', userIds[0], 'POST', {
    market_id: 1, side: 'buy', type: 'market', quantity: 1,
  }), env);
  const marketBuyBody = await marketBuy.json();
  assert.equal(marketBuy.status, 201);
  assert.equal(marketBuyBody.order.status, 'filled');
  assert.equal(marketBuyBody.order.filled_price, 100);
  assert.equal(marketBuyBody.position.reserved_cash, 100);
  assert.equal((await (await handlePaperTradingRequest(request('/api/paper/account', userIds[1]), env)).json()).reserved_cash, 0);

  quotePrice = 110;
  logicalNow += 6000;
  const positions = await (await handlePaperTradingRequest(request('/api/paper/positions', userIds[0]), env)).json();
  assert.equal(positions[0].unrealized_pnl, 10);
  assert.equal(positions[0].price_source, 'CoinPaprika');
  const accountAtMark = await (await handlePaperTradingRequest(request('/api/paper/account', userIds[0]), env)).json();
  assert.equal(accountAtMark.equity, 100010);

  const closed = await handlePaperTradingRequest(request('/api/paper/positions', userIds[0], 'DELETE', { id: positions[0].id }), env);
  assert.equal((await closed.json()).realized_pnl, 10);
  const afterClose = await (await handlePaperTradingRequest(request('/api/paper/account', userIds[0]), env)).json();
  assert.equal(afterClose.cash_balance, 100010);
  assert.equal(afterClose.reserved_cash, 0);

  const limit = await handlePaperTradingRequest(request('/api/paper/orders', userIds[0], 'POST', {
    market_id: 1, side: 'buy', type: 'limit', quantity: 1, limit_price: 105,
  }), env);
  assert.equal((await limit.json()).status, 'pending');
  quotePrice = 104;
  logicalNow += 6000;
  const limitOrders = await (await handlePaperTradingRequest(request('/api/paper/orders', userIds[0]), env)).json();
  assert.equal(limitOrders.find((order) => order.type === 'limit').status, 'filled');
  const limitPosition = db.sqlite.prepare("SELECT * FROM paper_positions WHERE user_id = ? AND status = 'open'").get(userIds[0]);
  await handlePaperTradingRequest(request('/api/paper/positions', userIds[0], 'DELETE', { id: limitPosition.id }), env);

  const stop = await handlePaperTradingRequest(request('/api/paper/orders', userIds[0], 'POST', {
    market_id: 1, side: 'buy', type: 'stop', quantity: 1, stop_price: 105,
  }), env);
  assert.equal((await stop.json()).status, 'pending');
  quotePrice = 106;
  logicalNow += 6000;
  const stopOrders = await (await handlePaperTradingRequest(request('/api/paper/orders', userIds[0]), env)).json();
  assert.equal(stopOrders.find((order) => order.type === 'stop').status, 'filled');
  const stopPosition = db.sqlite.prepare("SELECT * FROM paper_positions WHERE user_id = ? AND status = 'open'").get(userIds[0]);
  await handlePaperTradingRequest(request('/api/paper/positions', userIds[0], 'DELETE', { id: stopPosition.id }), env);

  quotePrice = 100;
  logicalNow += 6000;
  const stopLimit = await handlePaperTradingRequest(request('/api/paper/orders', userIds[0], 'POST', {
    market_id: 1, side: 'buy', type: 'stop_limit', quantity: 1, stop_price: 105, limit_price: 104,
  }), env);
  assert.equal((await stopLimit.json()).status, 'pending');
  quotePrice = 106;
  logicalNow += 6000;
  const triggeredOrders = await (await handlePaperTradingRequest(request('/api/paper/orders', userIds[0]), env)).json();
  assert.equal(triggeredOrders.find((order) => order.type === 'stop_limit').status, 'triggered');
  quotePrice = 104;
  logicalNow += 6000;
  const stopLimitOrders = await (await handlePaperTradingRequest(request('/api/paper/orders', userIds[0]), env)).json();
  assert.equal(stopLimitOrders.find((order) => order.type === 'stop_limit').status, 'filled');
  const stopLimitPosition = db.sqlite.prepare("SELECT * FROM paper_positions WHERE user_id = ? AND status = 'open'").get(userIds[0]);
  await handlePaperTradingRequest(request('/api/paper/positions', userIds[0], 'DELETE', { id: stopLimitPosition.id }), env);

  assert.equal(db.sqlite.prepare('SELECT COUNT(*) AS count FROM paper_fills WHERE user_id = ?').get(userIds[0]).count, 8);
  assert.equal(db.sqlite.prepare('SELECT COUNT(*) AS count FROM paper_fills WHERE user_id = ?').get(userIds[1]).count, 0);
  console.log('PAPER_TRADING_TESTS_PASSED');
} finally {
  globalThis.fetch = originalFetch;
  Date.now = originalDateNow;
  db.sqlite.close();
}
/* In-memory Supabase-compatible store for LOCAL DEVELOPMENT ONLY.
   Active when Supabase env vars are missing and we're not on Vercel
   (see db-client.js). Data lives per-process and resets on restart. */

const tables = new Map();

export const DEMO_USER_ID = 'demo-local-user';
export const DEMO_TOKEN = 'local-demo-token';

const DEMO_USER = {
  id: DEMO_USER_ID,
  email: 'demo@apex.local',
  aud: 'authenticated',
  role: 'authenticated',
  app_metadata: { provider: 'demo' },
  user_metadata: { full_name: 'Local Demo Trader', is_admin: true },
};

let demoWalletSeeded = false;

function rows(table) {
  if (!tables.has(table)) tables.set(table, []);
  return tables.get(table);
}

function nextId(table) {
  const list = rows(table);
  return list.reduce((m, r) => Math.max(m, Number(r.id) || 0), 0) + 1;
}

function looseEq(a, b) {
  return a === b || String(a) === String(b);
}

function cmp(a, b) {
  const na = Number(a);
  const nb = Number(b);
  if (a !== null && a !== undefined && b !== null && b !== undefined && !Number.isNaN(na) && !Number.isNaN(nb) && String(a).trim() !== '' && String(b).trim() !== '') {
    return na - nb;
  }
  return String(a ?? '').localeCompare(String(b ?? ''));
}

function likeToRegex(v) {
  const escaped = String(v).replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/%/g, '.*');
  return new RegExp(`^${escaped}$`, 'i');
}

const OR_OPS = {
  eq: (rowVal, val) => looseEq(rowVal, val),
  neq: (rowVal, val) => !looseEq(rowVal, val),
  gt: (rowVal, val) => cmp(rowVal, val) > 0,
  gte: (rowVal, val) => cmp(rowVal, val) >= 0,
  lt: (rowVal, val) => cmp(rowVal, val) < 0,
  lte: (rowVal, val) => cmp(rowVal, val) <= 0,
  like: (rowVal, val) => likeToRegex(val).test(String(rowVal ?? '')),
  ilike: (rowVal, val) => likeToRegex(val).test(String(rowVal ?? '')),
};

function parseOr(expr) {
  const checks = String(expr).split(',').map((seg) => {
    const parts = seg.split('.');
    if (parts.length < 3) return null;
    const col = parts[0];
    const op = parts[1];
    const val = parts.slice(2).join('.');
    const test = OR_OPS[op];
    return test ? (row) => test(row[col], val) : null;
  }).filter(Boolean);
  return (row) => checks.some((test) => test(row));
}

class Builder {
  constructor(table) {
    this.table = table;
    this.mode = 'select';
    this.payload = null;
    this.filters = [];
    this.orders = [];
    this.rangeFrom = null;
    this.rangeTo = null;
    this.limitCount = null;
    this.countMode = null;
    this.headOnly = false;
    this.singleRow = false;
  }

  select(_cols, opts) {
    if (['insert', 'update', 'delete'].includes(this.mode)) {
      if (opts?.count) this.countMode = opts.count;
      if (opts?.head) this.headOnly = true;
      return this;
    }
    this.mode = 'select';
    if (opts?.count) this.countMode = opts.count;
    if (opts?.head) this.headOnly = true;
    return this;
  }

  insert(payload) {
    this.mode = 'insert';
    this.payload = payload;
    return this;
  }

  upsert(payload) {
    this.mode = 'insert';
    this.payload = payload;
    return this;
  }

  update(payload) {
    this.mode = 'update';
    this.payload = payload;
    return this;
  }

  delete() {
    this.mode = 'delete';
    return this;
  }

  eq(col, val) { this.filters.push((r) => looseEq(r[col], val)); return this; }
  neq(col, val) { this.filters.push((r) => !looseEq(r[col], val)); return this; }
  gt(col, val) { this.filters.push((r) => cmp(r[col], val) > 0); return this; }
  gte(col, val) { this.filters.push((r) => cmp(r[col], val) >= 0); return this; }
  lt(col, val) { this.filters.push((r) => cmp(r[col], val) < 0); return this; }
  lte(col, val) { this.filters.push((r) => cmp(r[col], val) <= 0); return this; }
  like(col, val) { this.filters.push((r) => likeToRegex(val).test(String(r[col] ?? ''))); return this; }
  ilike(col, val) { this.filters.push((r) => likeToRegex(val).test(String(r[col] ?? ''))); return this; }
  in(col, vals) { const set = new Set((vals || []).map(String)); this.filters.push((r) => set.has(String(r[col]))); return this; }
  or(expr) { const test = parseOr(expr); if (test) this.filters.push(test); return this; }
  is(col, val) { this.filters.push((r) => (val === null ? r[col] === null || r[col] === undefined : r[col] === val)); return this; }

  order(col, opts) { this.orders.push({ col, asc: opts?.ascending !== false }); return this; }
  range(from, to) { this.rangeFrom = from; this.rangeTo = to; return this; }
  limit(n) { this.limitCount = n; return this; }
  single() { this.singleRow = true; return this; }
  maybeSingle() { this.singleRow = true; return this; }

  async rpc() { return { data: null, error: null }; }

  then(resolve) {
    try {
      resolve(this.exec());
    } catch (err) {
      resolve({ data: null, error: { message: String(err?.message || err), code: 'XX000' }, count: null });
    }
    return Promise.resolve();
  }

  exec() {
    const list = rows(this.table);
    let data = list.filter((r) => this.filters.every((f) => f(r)));

    if (this.mode === 'insert') {
      const incoming = Array.isArray(this.payload) ? this.payload : [this.payload];
      const inserted = [];
      const keyFor = (row) => this.table === 'crypto_addresses'
        ? `${String(row?.user_id ?? '')}|${String(row?.currency ?? '')}|${String(row?.network ?? '')}|${String(row?.address ?? '')}`
        : null;
      const seen = new Set(
        list
          .filter((row) => this.table === 'crypto_addresses')
          .map((row) => keyFor(row))
          .filter(Boolean)
      );

      for (const row of incoming) {
        if (!row) continue;
        const key = keyFor(row);
        if (this.table === 'crypto_addresses' && key && seen.has(key)) continue;
        const withId = { ...row, id: row.id ?? nextId(this.table) };
        list.push(withId);
        inserted.push(withId);
        if (this.table === 'crypto_addresses' && key) seen.add(key);
      }
      return { data: inserted, error: null, count: inserted.length };
    }

    if (this.mode === 'update') {
      const updated = [];
      for (const r of data) {
        Object.assign(r, this.payload);
        updated.push({ ...r });
      }
      return { data: updated, error: null, count: updated.length };
    }

    if (this.mode === 'delete') {
      const kill = new Set(data);
      tables.set(this.table, list.filter((r) => !kill.has(r)));
      return { data: [...data], error: null, count: data.length };
    }

    for (const { col, asc } of [...this.orders].reverse()) {
      data = [...data].sort((a, b) => (asc ? 1 : -1) * cmp(a[col], b[col]));
    }

    const count = this.countMode ? data.length : null;

    if (this.rangeFrom !== null && this.rangeTo !== null) {
      data = data.slice(this.rangeFrom, this.rangeTo + 1);
    } else if (this.limitCount !== null) {
      data = data.slice(0, this.limitCount);
    }

    if (this.singleRow) data = data[0] || null;

    return { data: this.headOnly ? null : data, error: null, count };
  }
}

function seedDemoWallet() {
  if (demoWalletSeeded) return;
  demoWalletSeeded = true;
  const wallet = rows('wallets').find((w) => w.user_id === DEMO_USER_ID && w.currency === 'USD');
  if (!wallet) {
    rows('wallets').push({ id: nextId('wallets'), user_id: DEMO_USER_ID, currency: 'USD', available: 100000, reserved: 0 });
  }
  
  // Seed demo traders table if empty
  const tradersList = rows('traders');
  if (tradersList.length === 0) {
    tradersList.push(
      { id: 1, name: 'Alex Chen', bio: 'Crypto futures specialist with 8+ years experience', avatar_url: 'https://i.pravatar.cc/150?img=11', asset_focus: ['BTC-USD', 'ETH-USD'], current_equity: 125000.00, total_return: 45.2, daily_return: 2.3, total_trades: 342, win_rate_trades: 68.5, max_drawdown: 12.3, volatility: 0.015, drift: 0.002, risk_score: 7, session_type: 'nyc', is_active: true, followers: 1250, created_at: new Date(), updated_at: new Date() },
      { id: 2, name: 'Sarah Martinez', bio: 'Forex and indices trader, former hedge fund analyst', avatar_url: 'https://i.pravatar.cc/150?img=5', asset_focus: ['EUR-USD', 'GBP-USD', 'SPX500'], current_equity: 98000.00, total_return: 32.8, daily_return: 1.1, total_trades: 521, win_rate_trades: 62.3, max_drawdown: 15.7, volatility: 0.012, drift: 0.0015, risk_score: 6, session_type: 'london', is_active: true, followers: 890, created_at: new Date(), updated_at: new Date() },
      { id: 3, name: 'Michael Wong', bio: 'Conservative long-term crypto investor', avatar_url: 'https://i.pravatar.cc/150?img=13', asset_focus: ['BTC-USD', 'ETH-USD', 'SOL-USD'], current_equity: 75000.00, total_return: 28.5, daily_return: 0.8, total_trades: 156, win_rate_trades: 71.2, max_drawdown: 8.9, volatility: 0.008, drift: 0.001, risk_score: 4, session_type: 'asia', is_active: true, followers: 2100, created_at: new Date(), updated_at: new Date() },
      { id: 4, name: 'Emma Thompson', bio: 'High-frequency scalper specializing in volatile markets', avatar_url: 'https://i.pravatar.cc/150?img=9', asset_focus: ['NAS100', 'GOLD', 'BTC-USD'], current_equity: 110000.00, total_return: 52.1, daily_return: 3.2, total_trades: 1205, win_rate_trades: 58.9, max_drawdown: 22.4, volatility: 0.025, drift: 0.003, risk_score: 9, session_type: 'nyc', is_active: true, followers: 756, created_at: new Date(), updated_at: new Date() },
      { id: 5, name: 'David Kim', bio: 'Balanced portfolio manager with focus on risk management', avatar_url: 'https://i.pravatar.cc/150?img=68', asset_focus: ['SPX500', 'EUR-USD', 'BTC-USD', 'ETH-USD'], current_equity: 88000.00, total_return: 35.6, daily_return: 1.5, total_trades: 423, win_rate_trades: 65.8, max_drawdown: 11.2, volatility: 0.01, drift: 0.0018, risk_score: 5, session_type: 'nyc', is_active: true, followers: 1450, created_at: new Date(), updated_at: new Date() }
    );
  }
  
  // Seed demo trader trades if empty
  const tradesList = rows('trader_trades');
  if (tradesList.length === 0) {
    const now = Date.now();
    for (let i = 1; i <= 5; i++) {
      for (let j = 0; j < 10; j++) {
        const isWin = Math.random() > 0.4;
        tradesList.push({
          id: nextId('trader_trades'),
          trader_id: i,
          symbol: ['BTC-USD', 'ETH-USD', 'EUR-USD', 'SPX500', 'GOLD'][Math.floor(Math.random() * 5)],
          side: Math.random() > 0.5 ? 'buy' : 'sell',
          entry_price: Math.random() * 50000 + 1000,
          exit_price: null,
          quantity: Math.random() * 10 + 0.1,
          pnl: isWin ? Math.random() * 500 + 50 : -(Math.random() * 300 + 50),
          pnl_percent: isWin ? Math.random() * 5 + 1 : -(Math.random() * 3 + 1),
          status: j < 3 ? 'open' : 'closed',
          opened_at: new Date(now - j * 3600000).toISOString(),
          closed_at: j < 3 ? null : new Date(now - (j - 2) * 3600000).toISOString(),
          created_at: new Date(),
          updated_at: new Date()
        });
      }
    }
  }
}

const devClient = {
  from(table) { return new Builder(table); },
  auth: {
    async getUser(token) {
      if (String(token || '').replace(/^Bearer\s+/i, '') === DEMO_TOKEN) {
        seedDemoWallet();
        return { data: { user: DEMO_USER }, error: null };
      }
      return { data: { user: null }, error: { message: 'invalid token' } };
    },
    admin: {
      async listUsers() {
        return { data: { users: [DEMO_USER] }, error: null };
      },
      async getUserById(userId) {
        if (String(userId) === DEMO_USER_ID) return { data: { user: DEMO_USER }, error: null };
        return { data: { user: null }, error: { message: 'not found' } };
      },
    },
  },
  channel() { return { on() { return this; }, subscribe() { return this; } }; },
  removeSubscription() {},
};

export function createDevClient() {
  return devClient;
}

export default devClient;

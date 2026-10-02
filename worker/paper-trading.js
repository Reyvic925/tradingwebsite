import { getAuthenticatedUser } from './auth.js';
import { getLiveMarketQuote } from './market-quotes.js';

const INITIAL_PAPER_CASH = 100000;
const OPEN_ORDER_STATUSES = ['pending', 'triggered'];

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    },
  });
}

async function readBody(request) {
  try {
    const body = await request.json();
    return body && typeof body === 'object' ? body : {};
  } catch {
    return {};
  }
}

async function ensurePaperAccount(db, userId) {
  await db.prepare(`
    INSERT OR IGNORE INTO paper_accounts (user_id, initial_cash, cash_balance)
    VALUES (?, ?, ?)
  `).bind(userId, INITIAL_PAPER_CASH, INITIAL_PAPER_CASH).run();
  return db.prepare('SELECT * FROM paper_accounts WHERE user_id = ?').bind(userId).first();
}

async function getQuote(db, marketId, symbol) {
  if (symbol === 'BTCUSD') {
    return getLiveMarketQuote(symbol);
  }
  const market = await db.prepare(`
    SELECT price, change_24h, high_24h, low_24h, volume
    FROM markets WHERE id = ?
  `).bind(marketId).first();
  const price = Number(market?.price);
  if (!Number.isFinite(price) || price <= 0) throw new Error(`No valid quote for ${symbol}.`);
  return {
    symbol,
    price,
    change_24h: Number(market.change_24h || 0),
    high_24h: market.high_24h == null ? null : Number(market.high_24h),
    low_24h: market.low_24h == null ? null : Number(market.low_24h),
    volume: Number(market.volume || 0),
    price_source: 'D1 reference',
    quote_updated_at: null,
  };
}

function limitCrossed(order, price) {
  return order.side === 'buy' ? price <= Number(order.limit_price) : price >= Number(order.limit_price);
}

function stopTriggered(order, price) {
  return order.side === 'buy' ? price >= Number(order.stop_price) : price <= Number(order.stop_price);
}

async function fillPaperOrder(db, userId, order, quote) {
  const price = Number(quote.price);
  const reservedCash = Number(order.quantity) * price;
  const changes = await db.batch([
    db.prepare(`
      UPDATE paper_accounts
      SET reserved_cash = reserved_cash + ?, updated_at = CURRENT_TIMESTAMP
      WHERE user_id = ? AND cash_balance - reserved_cash >= ?
    `).bind(reservedCash, userId, reservedCash),
    db.prepare(`
      UPDATE paper_orders
      SET status = 'filled', filled_price = ?, quote_source = ?, quote_updated_at = ?,
          filled_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND user_id = ? AND status IN ('pending', 'triggered') AND changes() = 1
    `).bind(price, quote.price_source, quote.quote_updated_at, order.id, userId),
    db.prepare(`
      INSERT INTO paper_positions
        (user_id, market_id, entry_order_id, symbol, side, quantity, entry_price, current_price,
         reserved_cash, stop_loss, take_profit, unrealized_pnl, price_source, quote_updated_at)
      SELECT user_id, market_id, id, symbol, CASE WHEN side = 'buy' THEN 'long' ELSE 'short' END,
        quantity, ?, ?, ?, stop_loss, take_profit, 0, quote_source, quote_updated_at
      FROM paper_orders
      WHERE id = ? AND user_id = ? AND status = 'filled' AND changes() = 1
    `).bind(price, price, reservedCash, order.id, userId),
    db.prepare(`
      INSERT INTO paper_fills
        (user_id, order_id, position_id, market_id, symbol, fill_type, side, quantity, price, quote_source, quote_updated_at)
      SELECT o.user_id, o.id, p.id, o.market_id, o.symbol, 'entry', o.side, o.quantity,
        o.filled_price, o.quote_source, o.quote_updated_at
      FROM paper_orders o JOIN paper_positions p ON p.entry_order_id = o.id
      WHERE o.id = ? AND o.user_id = ? AND changes() = 1
    `).bind(order.id, userId),
  ]);

  if (Number(changes[0]?.meta?.changes || 0) !== 1) {
    await db.prepare(`
      UPDATE paper_orders SET status = 'rejected', updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND user_id = ? AND status IN ('pending', 'triggered')
    `).bind(order.id, userId).run();
    return { rejected: true };
  }
  if (Number(changes[1]?.meta?.changes || 0) !== 1 || Number(changes[2]?.meta?.changes || 0) !== 1) {
    throw new Error('Paper order did not produce a position fill.');
  }

  const [filledOrder, position] = await Promise.all([
    db.prepare('SELECT * FROM paper_orders WHERE id = ? AND user_id = ?').bind(order.id, userId).first(),
    db.prepare('SELECT * FROM paper_positions WHERE entry_order_id = ? AND user_id = ?').bind(order.id, userId).first(),
  ]);
  return { order: filledOrder, position };
}

async function processPendingOrders(db, userId) {
  const pending = await db.prepare(`
    SELECT * FROM paper_orders
    WHERE user_id = ? AND status IN ('pending', 'triggered') AND type != 'close'
    ORDER BY id ASC LIMIT 100
  `).bind(userId).all();
  const updates = [];

  for (const order of pending.results || []) {
    let quote;
    try {
      quote = await getQuote(db, order.market_id, order.symbol);
    } catch (error) {
      console.error(`[worker/paper-trading] Quote unavailable for ${order.symbol}`, error?.message || error);
      continue;
    }

    let triggered = order.status === 'triggered';
    if ((order.type === 'stop' || order.type === 'stop_limit') && !triggered) {
      triggered = stopTriggered(order, quote.price);
      if (triggered) {
        await db.prepare(`
          UPDATE paper_orders SET status = 'triggered', triggered_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
          WHERE id = ? AND user_id = ? AND status = 'pending'
        `).bind(order.id, userId).run();
      }
    }

    const readyToFill = order.type === 'market'
      || (order.type === 'limit' && limitCrossed(order, quote.price))
      || (order.type === 'stop' && triggered)
      || (order.type === 'stop_limit' && triggered && limitCrossed(order, quote.price));
    if (!readyToFill) continue;

    const fill = await fillPaperOrder(db, userId, order, quote);
    updates.push(fill);
  }
  return updates;
}

async function refreshOpenPositions(db, userId) {
  const result = await db.prepare(`
    SELECT * FROM paper_positions WHERE user_id = ? AND status = 'open' ORDER BY id DESC LIMIT 100
  `).bind(userId).all();
  const quotes = new Map();
  const statements = [];

  for (const position of result.results || []) {
    let quote = quotes.get(position.symbol);
    if (!quote) {
      quote = await getQuote(db, position.market_id, position.symbol);
      quotes.set(position.symbol, quote);
    }
    const direction = position.side === 'long' ? 1 : -1;
    const unrealizedPnl = (Number(quote.price) - Number(position.entry_price)) * Number(position.quantity) * direction;
    statements.push(db.prepare(`
      UPDATE paper_positions
      SET current_price = ?, unrealized_pnl = ?, price_source = ?, quote_updated_at = ?
      WHERE id = ? AND user_id = ? AND status = 'open'
    `).bind(quote.price, unrealizedPnl, quote.price_source, quote.quote_updated_at, position.id, userId));
  }

  if (statements.length) await db.batch(statements);
  const refreshed = await db.prepare(`
    SELECT * FROM paper_positions WHERE user_id = ? AND status = 'open' ORDER BY id DESC LIMIT 100
  `).bind(userId).all();
  return refreshed.results || [];
}

async function accountSnapshot(db, userId) {
  await ensurePaperAccount(db, userId);
  await processPendingOrders(db, userId);
  const positions = await refreshOpenPositions(db, userId);
  const account = await db.prepare('SELECT * FROM paper_accounts WHERE user_id = ?').bind(userId).first();
  const unrealizedPnl = positions.reduce((total, position) => total + Number(position.unrealized_pnl || 0), 0);
  return {
    initial_cash: Number(account.initial_cash),
    cash_balance: Number(account.cash_balance),
    reserved_cash: Number(account.reserved_cash),
    available_cash: Number(account.cash_balance) - Number(account.reserved_cash),
    realized_pnl: Number(account.realized_pnl),
    unrealized_pnl: unrealizedPnl,
    equity: Number(account.cash_balance) + unrealizedPnl,
    quote_source: positions.length ? positions[0].price_source : null,
    quote_updated_at: positions.length ? positions[0].quote_updated_at : null,
  };
}

async function createPaperOrder(request, env, userId) {
  const db = env.DB;
  const body = await readBody(request);
  const marketId = Number(body.market_id);
  const quantity = Number(body.quantity);
  const side = String(body.side || '').toLowerCase();
  const type = String(body.type || 'market').toLowerCase();
  const supportedTypes = ['market', 'limit', 'stop', 'stop_limit'];
  if (!Number.isSafeInteger(marketId) || marketId <= 0 || !Number.isFinite(quantity) || quantity <= 0
      || !['buy', 'sell'].includes(side) || !supportedTypes.includes(type)) {
    return json({ error: 'A valid market, side, order type, and positive quantity are required.' }, 400);
  }

  const limitPrice = body.limit_price == null || body.limit_price === '' ? null : Number(body.limit_price);
  const stopPrice = body.stop_price == null || body.stop_price === '' ? null : Number(body.stop_price);
  if ((type === 'limit' || type === 'stop_limit') && !(limitPrice > 0)) return json({ error: 'Enter a positive limit price.' }, 400);
  if ((type === 'stop' || type === 'stop_limit') && !(stopPrice > 0)) return json({ error: 'Enter a positive stop price.' }, 400);

  const market = await db.prepare('SELECT id, symbol FROM markets WHERE id = ?').bind(marketId).first();
  if (!market) return json({ error: 'Unknown market.' }, 400);
  await ensurePaperAccount(db, userId);
  const operationId = crypto.randomUUID();
  const order = await db.prepare(`
    INSERT INTO paper_orders
      (user_id, market_id, operation_id, symbol, side, type, quantity, limit_price, stop_price, stop_loss, take_profit)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    RETURNING *
  `).bind(
    userId,
    market.id,
    operationId,
    market.symbol,
    side,
    type,
    quantity,
    limitPrice,
    stopPrice,
    body.stop_loss == null || body.stop_loss === '' ? null : Number(body.stop_loss),
    body.take_profit == null || body.take_profit === '' ? null : Number(body.take_profit),
  ).first();

  if (type === 'market') {
    const filled = await processPendingOrders(db, userId);
    const current = await db.prepare('SELECT * FROM paper_orders WHERE id = ?').bind(order.id).first();
    if (current.status === 'rejected') return json({ error: 'Insufficient virtual buying power.' }, 400);
    const position = await db.prepare('SELECT * FROM paper_positions WHERE entry_order_id = ?').bind(order.id).first();
    return json({ order: current, position, quote_source: current.quote_source, quote_updated_at: current.quote_updated_at }, 201);
  }

  await processPendingOrders(db, userId);
  const current = await db.prepare('SELECT * FROM paper_orders WHERE id = ?').bind(order.id).first();
  return json(current, 201);
}

async function closePaperPosition(request, env, userId) {
  const db = env.DB;
  const body = await readBody(request);
  const id = Number(body.id);
  if (!Number.isSafeInteger(id) || id <= 0) return json({ error: 'Valid paper position id is required.' }, 400);
  const position = await db.prepare(`
    SELECT * FROM paper_positions WHERE id = ? AND user_id = ? AND status = 'open'
  `).bind(id, userId).first();
  if (!position) return json({ error: 'Open paper position not found.' }, 404);

  let quote;
  try {
    quote = await getQuote(db, position.market_id, position.symbol);
  } catch (error) {
    console.error(`[worker/paper-trading] Quote unavailable while closing ${position.symbol}`, error?.message || error);
    return json({ error: 'A fresh market quote is unavailable. The position remains open.' }, 503);
  }
  const direction = position.side === 'long' ? 1 : -1;
  const realizedPnl = (Number(quote.price) - Number(position.entry_price)) * Number(position.quantity) * direction;
  const operationId = crypto.randomUUID();
  const results = await db.batch([
    db.prepare(`
      UPDATE paper_positions
      SET status = 'closed', current_price = ?, unrealized_pnl = 0, realized_pnl = ?,
          price_source = ?, quote_updated_at = ?, closed_at = CURRENT_TIMESTAMP
      WHERE id = ? AND user_id = ? AND status = 'open'
    `).bind(quote.price, realizedPnl, quote.price_source, quote.quote_updated_at, id, userId),
    db.prepare(`
      UPDATE paper_accounts
      SET cash_balance = cash_balance + ?,
          reserved_cash = MAX(0, reserved_cash - ?),
          realized_pnl = realized_pnl + ?, updated_at = CURRENT_TIMESTAMP
      WHERE user_id = ? AND changes() = 1
    `).bind(realizedPnl, position.reserved_cash, realizedPnl, userId),
    db.prepare(`
      INSERT INTO paper_orders
        (user_id, market_id, operation_id, symbol, side, type, quantity, status, filled_price,
         quote_source, quote_updated_at, filled_at)
      SELECT ?, ?, ?, ?, ?, 'close', ?, 'filled', ?, ?, ?, CURRENT_TIMESTAMP
      WHERE changes() = 1
    `).bind(userId, position.market_id, operationId, position.symbol, direction === 1 ? 'sell' : 'buy', position.quantity,
      quote.price, quote.price_source, quote.quote_updated_at),
    db.prepare(`
      INSERT INTO paper_fills
        (user_id, order_id, position_id, market_id, symbol, fill_type, side, quantity, price, quote_source, quote_updated_at)
      SELECT ?, o.id, ?, ?, ?, 'close', o.side, ?, o.filled_price, o.quote_source, o.quote_updated_at
      FROM paper_orders o WHERE o.operation_id = ? AND changes() = 1
    `).bind(userId, id, position.market_id, position.symbol, position.quantity, operationId),
  ]);
  if (Number(results[0]?.meta?.changes || 0) !== 1) return json({ error: 'Paper position was already closed.' }, 409);
  const closed = await db.prepare('SELECT * FROM paper_positions WHERE id = ? AND user_id = ?').bind(id, userId).first();
  return json(closed);
}

export async function handlePaperTradingRequest(request, env) {
  try {
    const user = await getAuthenticatedUser(request, env);
    if (!user) return json({ error: 'Unauthorized' }, 401);
    const url = new URL(request.url);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204 });
    if (url.pathname === '/api/paper/account' && request.method === 'GET') {
      return json(await accountSnapshot(env.DB, user.id));
    }
    if (url.pathname === '/api/paper/positions' && request.method === 'GET') {
      await ensurePaperAccount(env.DB, user.id);
      await processPendingOrders(env.DB, user.id);
      const positions = await refreshOpenPositions(env.DB, user.id);
      return json(positions);
    }
    if (url.pathname === '/api/paper/positions' && request.method === 'DELETE') {
      return await closePaperPosition(request, env, user.id);
    }
    if (url.pathname === '/api/paper/orders' && request.method === 'GET') {
      await ensurePaperAccount(env.DB, user.id);
      await processPendingOrders(env.DB, user.id);
      const result = await env.DB.prepare(`
        SELECT * FROM paper_orders WHERE user_id = ? ORDER BY id DESC LIMIT 100
      `).bind(user.id).all();
      return json(result.results || []);
    }
    if (url.pathname === '/api/paper/orders' && request.method === 'POST') {
      return await createPaperOrder(request, env, user.id);
    }
    if (url.pathname === '/api/paper/orders' && request.method === 'DELETE') {
      const body = await readBody(request);
      const id = Number(body.id);
      if (!Number.isSafeInteger(id) || id <= 0) return json({ error: 'Valid paper order id is required.' }, 400);
      const order = await env.DB.prepare(`
        UPDATE paper_orders SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND user_id = ? AND status IN ('pending', 'triggered') RETURNING id
      `).bind(id, user.id).first();
      return order ? json({ ok: true }) : json({ error: 'Pending paper order not found.' }, 404);
    }
    return json({ error: 'Not found' }, 404);
  } catch (error) {
    console.error('[worker/paper-trading]', error);
    return json({ error: 'Paper trading is temporarily unavailable.' }, 500);
  }
}
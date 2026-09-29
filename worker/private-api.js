import { getAuthenticatedUser } from './auth.js';

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

async function listTransactions(db, userId) {
  const result = await db.prepare(`
    SELECT * FROM transactions
    WHERE user_id = ?
    ORDER BY id DESC
    LIMIT 200
  `).bind(userId).all();
  return json(result.results || []);
}

async function listInvestments(db, userId) {
  const [investmentResult, planResult] = await Promise.all([
    db.prepare('SELECT * FROM investments WHERE user_id = ? ORDER BY id DESC').bind(userId).all(),
    db.prepare('SELECT * FROM plans').all(),
  ]);
  const plans = new Map((planResult.results || []).map((plan) => [Number(plan.id), plan]));
  return json((investmentResult.results || []).map((investment) => ({
    ...investment,
    plan: plans.get(Number(investment.plan_id)) || null,
  })));
}

async function listPositions(request, db, userId) {
  const status = new URL(request.url).searchParams.get('status') || 'open';
  const result = status === 'all'
    ? await db.prepare(`
      SELECT p.*, m.price AS latest_price
      FROM positions p LEFT JOIN markets m ON m.id = p.market_id
      WHERE p.user_id = ?
      ORDER BY p.id DESC
    `).bind(userId).all()
    : await db.prepare(`
      SELECT p.*, m.price AS latest_price
      FROM positions p LEFT JOIN markets m ON m.id = p.market_id
      WHERE p.user_id = ? AND p.status = ?
      ORDER BY p.id DESC
    `).bind(userId, status).all();

  const positions = (result.results || []).map((position) => {
    const price = Number(position.latest_price ?? position.current_price ?? 0);
    const direction = ['long', 'buy'].includes(position.side) ? 1 : -1;
    const pnl = (price - Number(position.entry_price)) * Number(position.quantity) * direction;
    const { latest_price: _latestPrice, ...row } = position;
    return { ...row, current_price: price, pnl };
  });
  return json(positions);
}

async function listOrders(db, userId) {
  const result = await db.prepare(`
    SELECT * FROM orders
    WHERE user_id = ?
    ORDER BY id DESC
    LIMIT 100
  `).bind(userId).all();
  return json(result.results || []);
}

async function handleNotifications(request, db, userId) {
  if (request.method === 'GET') {
    const result = await db.prepare(`
      SELECT * FROM notifications
      WHERE user_id = ?
      ORDER BY id DESC
      LIMIT 50
    `).bind(userId).all();
    return json(result.results || []);
  }

  if (request.method === 'PUT') {
    const body = await readBody(request);
    if (body.all) {
      await db.prepare('UPDATE notifications SET read = 1 WHERE user_id = ?').bind(userId).run();
      return json({ ok: true });
    }
    if (!body.id) return json({ error: 'Missing id' }, 400);
    const id = Number(body.id);
    if (!Number.isSafeInteger(id) || id <= 0) return json({ error: 'Invalid id' }, 400);
    await db.prepare('UPDATE notifications SET read = 1 WHERE id = ? AND user_id = ?').bind(id, userId).run();
    const notification = await db.prepare('SELECT * FROM notifications WHERE id = ? AND user_id = ?')
      .bind(id, userId).first();
    return notification ? json(notification) : json({ error: 'Notification not found' }, 404);
  }

  if (request.method === 'DELETE') {
    const body = await readBody(request);
    if (!body.id) return json({ error: 'Missing id' }, 400);
    const id = Number(body.id);
    if (!Number.isSafeInteger(id) || id <= 0) return json({ error: 'Invalid id' }, 400);
    await db.prepare('DELETE FROM notifications WHERE id = ? AND user_id = ?').bind(id, userId).run();
    return json({ ok: true });
  }

  return json({ error: 'Method not allowed' }, 405);
}

async function handleWatchlist(request, db, userId) {
  if (request.method === 'GET') {
    const result = await db.prepare(`
      SELECT * FROM watchlist
      WHERE user_id = ?
      ORDER BY id DESC
    `).bind(userId).all();
    return json(result.results || []);
  }

  const body = await readBody(request);
  const marketId = Number(body.market_id);
  if (!Number.isSafeInteger(marketId) || marketId <= 0) return json({ error: 'Invalid market_id' }, 400);

  if (request.method === 'POST') {
    const market = await db.prepare('SELECT id, symbol FROM markets WHERE id = ?').bind(marketId).first();
    if (!market) return json({ error: 'Market not found' }, 404);
    await db.prepare(`
      INSERT OR IGNORE INTO watchlist (user_id, market_id, symbol)
      VALUES (?, ?, ?)
    `).bind(userId, marketId, market.symbol).run();
    const row = await db.prepare('SELECT * FROM watchlist WHERE user_id = ? AND market_id = ?')
      .bind(userId, marketId).first();
    return json(row, 201);
  }

  if (request.method === 'DELETE') {
    await db.prepare('DELETE FROM watchlist WHERE user_id = ? AND market_id = ?')
      .bind(userId, marketId).run();
    return json({ ok: true });
  }

  return json({ error: 'Method not allowed' }, 405);
}

export async function handlePrivateRequest(request, env) {
  try {
    const user = await getAuthenticatedUser(request, env);
    if (!user) return json({ error: 'Unauthorized' }, 401);
    const pathname = new URL(request.url).pathname;

    if (pathname === '/api/transactions' && request.method === 'GET') return await listTransactions(env.DB, user.id);
    if (pathname === '/api/investments' && request.method === 'GET') return await listInvestments(env.DB, user.id);
    if (pathname === '/api/positions' && request.method === 'GET') return await listPositions(request, env.DB, user.id);
    if (pathname === '/api/orders' && request.method === 'GET') return await listOrders(env.DB, user.id);
    if (pathname === '/api/notifications') return await handleNotifications(request, env.DB, user.id);
    if (pathname === '/api/watchlist') return await handleWatchlist(request, env.DB, user.id);
    return json({ error: 'Not found' }, 404);
  } catch (error) {
    console.error('[worker/private-api]', error);
    return json({ error: 'Internal server error' }, 500);
  }
}
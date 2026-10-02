import { getAuthenticatedUser } from './auth.js';
import { sendUserEmail } from './email.js';
import { getLiveMarketQuote } from './market-quotes.js';

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
  const [investmentResult, planResult, tierResult] = await Promise.all([
    db.prepare('SELECT * FROM investments WHERE user_id = ? ORDER BY id DESC').bind(userId).all(),
    db.prepare('SELECT * FROM plans').all(),
    db.prepare('SELECT * FROM investment_tiers').all(),
  ]);
  const plans = new Map((planResult.results || []).map((plan) => [Number(plan.id), plan]));
  const tiers = new Map((tierResult.results || []).map((tier) => [Number(tier.id), tier]));
  return json((investmentResult.results || []).map((investment) => ({
    ...investment,
    plan: plans.get(Number(investment.plan_id)) || null,
    tier_details: tiers.get(Number(investment.tier_id)) || null,
  })));
}

async function getInvestmentDetail(db, userId, investmentId) {
  const investment = await db.prepare(`
    SELECT * FROM investments WHERE id = ? AND user_id = ?
  `).bind(investmentId, userId).first();
  if (!investment) return json({ error: 'Investment not found.' }, 404);

  const [plan, tier, transactionResult, profile, pendingWithdrawal] = await Promise.all([
    investment.plan_id
      ? db.prepare('SELECT * FROM plans WHERE id = ?').bind(investment.plan_id).first()
      : Promise.resolve(null),
    investment.tier_id
      ? db.prepare('SELECT * FROM investment_tiers WHERE id = ?').bind(investment.tier_id).first()
      : Promise.resolve(null),
    db.prepare(`
      SELECT * FROM investment_transactions
      WHERE investment_id = ? AND user_id = ?
      ORDER BY created_at ASC
    `).bind(investment.id, userId).all(),
    db.prepare('SELECT tier, locked_balance FROM profiles WHERE user_id = ?').bind(userId).first(),
    db.prepare(`
      SELECT 1 AS pending FROM withdrawals
      WHERE user_id = ? AND investment_id = ? AND type = 'roi' AND status = 'pending'
      LIMIT 1
    `).bind(userId, investment.id).first(),
  ]);
  const transactions = transactionResult.results || [];
  const withdrawalPending = Boolean(pendingWithdrawal);
  return json({
    investment: { ...investment, plan, tier_details: tier },
    transactions,
    userTier: profile?.tier || tier?.name || plan?.name || investment.plan_name || 'Member',
    lockedBalance: Number(profile?.locked_balance || 0),
    withdrawalPending,
  });
}

async function createInvestment(request, env, userId) {
  const db = env.DB;
  const body = await readBody(request);
  const planId = body.plan_id == null || body.plan_id === '' ? null : Number(body.plan_id);
  const tierId = body.tier_id == null || body.tier_id === '' ? null : Number(body.tier_id);
  const amount = Number(body.amount);
  if ((planId == null) === (tierId == null)) {
    return json({ error: 'Provide exactly one valid plan_id or tier_id.' }, 400);
  }
  if (!Number.isSafeInteger(planId ?? tierId) || (planId ?? tierId) <= 0 || !Number.isFinite(amount) || amount <= 0) {
    return json({ error: 'A valid investment product and positive amount are required.' }, 400);
  }

  const isTier = tierId != null;
  const product = isTier
    ? await db.prepare('SELECT * FROM investment_tiers WHERE id = ? AND simulation_enabled = 1').bind(tierId).first()
    : await db.prepare('SELECT * FROM plans WHERE id = ?').bind(planId).first();
  if (!product) return json({ error: isTier ? 'Investment tier not found.' : 'Investment plan not found.' }, 404);

  const minimum = Number(isTier ? product.min_investment : product.min_amount);
  const maximum = Number(isTier ? product.max_investment : product.max_amount);
  if (Number.isFinite(minimum) && amount < minimum) return json({ error: `Minimum investment is $${minimum}.` }, 400);
  if (Number.isFinite(maximum) && maximum > 0 && amount > maximum) return json({ error: `Maximum investment is $${maximum}.` }, 400);

  const durationDays = Number(product.duration_days);
  if (!Number.isSafeInteger(durationDays) || durationDays <= 0) return json({ error: 'Investment duration is not configured.' }, 409);
  const now = new Date();
  const endDate = new Date(now.getTime() + durationDays * 86400000);
  const startDateIso = now.toISOString();
  const endDateIso = endDate.toISOString();
  const operationId = crypto.randomUUID();
  const name = String(product.name || 'Investment');
  const dailyRate = isTier ? null : Number(product.daily_rate || 0);
  const description = isTier
    ? `Initial investment of $${amount} in ${name} tier (${durationDays} days)`
    : `Initial investment of $${amount} in ${name} plan (${durationDays} days)`;

  const results = await db.batch([
    db.prepare(`
      UPDATE wallets SET available = available - ?
      WHERE user_id = ? AND currency = 'USD' AND available >= ?
    `).bind(amount, userId, amount),
    db.prepare(`
      INSERT INTO investments
        (user_id, plan_id, tier_id, plan_name, amount, daily_rate, duration_days, start_date, end_date, status, earned, days_elapsed, operation_id)
      SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', 0, 0, ?
      WHERE changes() = 1
      RETURNING *
    `).bind(userId, planId, tierId, name, amount, dailyRate, durationDays, startDateIso, endDateIso, operationId),
    db.prepare(`
      INSERT INTO wallet_ledger (user_id, currency, entry_type, amount, source_type, source_id)
      SELECT user_id, 'USD', 'debit', amount, 'investment', id
      FROM investments WHERE operation_id = ?
    `).bind(operationId),
    db.prepare(`
      INSERT INTO transactions (user_id, type, amount, currency, method, status, reference)
      SELECT user_id, 'investment', amount, 'USD', 'wallet', 'completed', 'INV-' || id
      FROM investments WHERE operation_id = ?
    `).bind(operationId),
    db.prepare(`
      INSERT INTO investment_transactions (investment_id, user_id, type, amount, description)
      SELECT id, user_id, 'deposit', amount, ? FROM investments WHERE operation_id = ?
    `).bind(description, operationId),
    ...(isTier ? [db.prepare(`
      UPDATE profiles SET tier = ?
      WHERE user_id = ?
        AND CASE tier WHEN 'Starter' THEN 0 WHEN 'Silver' THEN 1 WHEN 'Gold' THEN 2 WHEN 'Platinum' THEN 3 WHEN 'Diamond' THEN 4 ELSE 0 END
          < CASE ? WHEN 'Starter' THEN 0 WHEN 'Silver' THEN 1 WHEN 'Gold' THEN 2 WHEN 'Platinum' THEN 3 WHEN 'Diamond' THEN 4 ELSE 0 END
        AND EXISTS (SELECT 1 FROM investments WHERE operation_id = ?)
    `).bind(name, userId, name, operationId)] : []),
    db.prepare(`
      INSERT INTO notifications (user_id, title, body, read)
      SELECT user_id, ?, ?, 0 FROM investments WHERE operation_id = ?
    `).bind(
      `Investment created in ${name}`,
      `Invested $${amount} for ${durationDays} days.`,
      operationId,
    ),
  ]);

  if (Number(results[0]?.meta?.changes || 0) !== 1) {
    return json({ error: 'Insufficient available balance.' }, 400);
  }
  const investment = results[1]?.results?.[0];
  if (!investment) throw new Error('Investment debit succeeded but no investment row was created.');
  await sendUserEmail(env, userId, {
    subject: `Investment created in ${name}`,
    text: `Invested $${amount} for ${durationDays} days.`,
  }, 'worker/private-api');
  return json({ ...investment, plan: isTier ? null : product, tier_details: isTier ? product : null }, 201);
}

async function handleInvestments(request, env, userId) {
  const db = env.DB;
  if (request.method === 'GET') {
    const idValue = new URL(request.url).searchParams.get('id');
    if (idValue) {
      const id = Number(idValue);
      if (!Number.isSafeInteger(id) || id <= 0) return json({ error: 'Invalid investment id.' }, 400);
      return await getInvestmentDetail(db, userId, id);
    }
    return await listInvestments(db, userId);
  }
  if (request.method === 'POST') return await createInvestment(request, env, userId);
  return json({ error: 'Method not allowed' }, 405);
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

  const rows = result.results || [];
  let liveBtcQuote = null;
  if (rows.some((position) => position.status === 'open' && position.symbol === 'BTCUSD')) {
    try {
      liveBtcQuote = await getLiveMarketQuote('BTCUSD');
    } catch (error) {
      console.error('[worker/private-api] Live BTC quote unavailable for P&L', error?.message || error);
      return json({ error: 'Live BTC pricing is temporarily unavailable. P&L cannot be refreshed.' }, 503);
    }
  }

  const positions = rows.map((position) => {
    const isOpen = position.status === 'open';
    const isLiveBtc = isOpen && position.symbol === 'BTCUSD';
    const price = Number(isLiveBtc ? liveBtcQuote.price : position.latest_price ?? position.current_price ?? 0);
    const direction = ['long', 'buy'].includes(position.side) ? 1 : -1;
    const pnl = isOpen
      ? (price - Number(position.entry_price)) * Number(position.quantity) * direction
      : Number(position.pnl || 0);
    const { latest_price: _latestPrice, ...row } = position;
    return {
      ...row,
      current_price: price,
      pnl,
      price_source: isLiveBtc ? liveBtcQuote.price_source : 'D1 reference',
      quote_updated_at: isLiveBtc ? liveBtcQuote.quote_updated_at : null,
    };
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

function nullablePositiveNumber(value, field) {
  if (value === undefined || value === null || value === '') return { value: null };
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return { error: `${field} must be a positive number.` };
  return { value: number };
}

function orderErrorResponse(error) {
  const message = String(error?.message || error || '');
  if (message.includes('INSUFFICIENT_MARGIN')) return json({ error: 'Insufficient available balance for order margin.' }, 400);
  if (message.includes('OPPOSING_POSITION_MUST_BE_CLOSED_FIRST')) {
    return json({ error: 'Close the existing position before opening the opposite side.' }, 409);
  }
  if (message.includes('WALLET_NOT_FOUND')) return json({ error: 'USD wallet not found.' }, 400);
  return null;
}

async function createOrder(request, env, userId) {
  const db = env.DB;
  const body = await readBody(request);
  const marketId = Number(body.market_id);
  const quantity = Number(body.quantity);
  const side = String(body.side || '').toLowerCase();
  const type = body.type === 'limit' ? 'limit' : 'market';
  if (!Number.isSafeInteger(marketId) || marketId <= 0 || !Number.isFinite(quantity) || quantity <= 0 || !['buy', 'sell'].includes(side)) {
    return json({ error: 'A valid market_id, side, and positive quantity are required.' }, 400);
  }

  const stopLoss = nullablePositiveNumber(body.stop_loss, 'stop_loss');
  const takeProfit = nullablePositiveNumber(body.take_profit, 'take_profit');
  if (stopLoss.error) return json({ error: stopLoss.error }, 400);
  if (takeProfit.error) return json({ error: takeProfit.error }, 400);

  const market = await db.prepare('SELECT id, symbol, price FROM markets WHERE id = ?')
    .bind(marketId).first();
  if (!market) return json({ error: 'Unknown market.' }, 400);

  let liveQuote = null;
  if (type === 'market' && market.symbol === 'BTCUSD') {
    try {
      liveQuote = await getLiveMarketQuote('BTCUSD');
    } catch (error) {
      console.error('[worker/private-api] Live BTC quote unavailable for order', error?.message || error);
      return json({ error: 'Live BTC pricing is temporarily unavailable. Try again before placing this order.' }, 503);
    }
  }
  const price = type === 'limit' ? Number(body.price) : Number(liveQuote?.price ?? market.price);
  if (!Number.isFinite(price) || price <= 0) return json({ error: 'A valid order price is required.' }, 400);
  const operationId = crypto.randomUUID();
  if (type === 'limit') {
    const result = await db.prepare(`
      INSERT INTO orders
        (user_id, market_id, symbol, side, type, quantity, price, stop_loss, take_profit, status, filled_price, operation_id)
      VALUES (?, ?, ?, ?, 'limit', ?, ?, ?, ?, 'pending', NULL, ?)
      RETURNING *
    `).bind(userId, marketId, market.symbol, side, quantity, price, stopLoss.value, takeProfit.value, operationId).first();
    return json(result, 201);
  }

  const margin = quantity * price * 0.1;
  try {
    const results = await db.batch([
      db.prepare(`
        UPDATE wallets
        SET available = available - ?, reserved = reserved + ?
        WHERE user_id = ? AND currency = 'USD' AND available >= ?
          AND NOT EXISTS (
            SELECT 1 FROM positions p
            WHERE p.user_id = ? AND p.market_id = ? AND p.status = 'open'
              AND NOT (
                (p.side IN ('long', 'buy') AND ? = 'buy')
                OR (p.side IN ('short', 'sell') AND ? = 'sell')
              )
          )
      `).bind(margin, margin, userId, margin, userId, marketId, side, side),
      db.prepare(`
        INSERT INTO orders
          (user_id, market_id, symbol, side, type, quantity, price, stop_loss, take_profit, status, filled_price, operation_id)
        SELECT ?, ?, ?, ?, 'market', ?, ?, ?, ?, 'filled', ?, ?
        WHERE changes() = 1
      `).bind(userId, marketId, market.symbol, side, quantity, price, stopLoss.value, takeProfit.value, price, operationId),
      db.prepare(`
        UPDATE positions
        SET entry_price = ((entry_price * quantity) + (? * ?)) / (quantity + ?),
            quantity = quantity + ?,
            current_price = ?,
            margin = margin + ?,
            stop_loss = COALESCE(?, stop_loss),
            take_profit = COALESCE(?, take_profit)
        WHERE user_id = ? AND market_id = ? AND status = 'open'
          AND ((side IN ('long', 'buy') AND ? = 'buy') OR (side IN ('short', 'sell') AND ? = 'sell'))
          AND EXISTS (SELECT 1 FROM orders WHERE operation_id = ?)
      `).bind(price, quantity, quantity, quantity, price, margin, stopLoss.value, takeProfit.value, userId, marketId, side, side, operationId),
      db.prepare(`
        INSERT INTO positions
          (user_id, market_id, symbol, side, quantity, entry_price, current_price, stop_loss, take_profit, pnl, margin, status)
        SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, 'open'
        WHERE EXISTS (SELECT 1 FROM orders WHERE operation_id = ?)
          AND NOT EXISTS (
            SELECT 1 FROM positions WHERE user_id = ? AND market_id = ? AND status = 'open'
          )
      `).bind(userId, marketId, market.symbol, side === 'buy' ? 'long' : 'short', quantity, price, price, stopLoss.value, takeProfit.value, margin, operationId, userId, marketId),
      db.prepare(`
        INSERT INTO wallet_ledger (user_id, currency, entry_type, amount, source_type, source_id)
        SELECT user_id, 'USD', 'debit', quantity * price * 0.1, 'order_margin', id
        FROM orders WHERE operation_id = ?
      `).bind(operationId),
      db.prepare(`
        INSERT INTO notifications (user_id, title, body, read)
        SELECT user_id, 'Filled ' || upper(side) || ' ' || symbol,
          CAST(quantity AS TEXT) || ' @ ' || CAST(price AS TEXT) || ' · margin ' || CAST(quantity * price * 0.1 AS TEXT) || ' USD', 0
        FROM orders WHERE operation_id = ?
      `).bind(operationId),
    ]);
    if (Number(results[0]?.meta?.changes || 0) !== 1 || Number(results[1]?.meta?.changes || 0) !== 1) {
      const opposingPosition = await db.prepare(`
        SELECT id FROM positions
        WHERE user_id = ? AND market_id = ? AND status = 'open'
          AND NOT (
            (side IN ('long', 'buy') AND ? = 'buy')
            OR (side IN ('short', 'sell') AND ? = 'sell')
          )
      `).bind(userId, marketId, side, side).first();
      if (opposingPosition) return json({ error: 'Close the existing position before opening the opposite side.' }, 409);
      const wallet = await db.prepare("SELECT id FROM wallets WHERE user_id = ? AND currency = 'USD'")
        .bind(userId).first();
      return json({ error: wallet ? 'Insufficient available balance for order margin.' : 'USD wallet not found.' }, 400);
    }
    const order = await db.prepare('SELECT * FROM orders WHERE operation_id = ?').bind(operationId).first();
    const position = await db.prepare(`
      SELECT * FROM positions
      WHERE user_id = ? AND market_id = ? AND status = 'open'
      ORDER BY id ASC LIMIT 1
    `).bind(userId, marketId).first();
    await sendUserEmail(env, userId, {
      subject: `Filled ${side.toUpperCase()} ${market.symbol}`,
      text: `${quantity} ${market.symbol} filled at ${price}. The order used 10% initial margin.`,
    }, 'worker/private-api');
    return json({
      order,
      position,
      ...(liveQuote ? { price_source: liveQuote.price_source, quote_updated_at: liveQuote.quote_updated_at } : {}),
    }, 201);
  } catch (error) {
    if (/idx_positions_one_open_per_market|UNIQUE constraint failed: positions/i.test(String(error?.message || ''))) {
      return json({ error: 'The open position changed concurrently. Refresh before submitting another order.' }, 409);
    }
    const response = orderErrorResponse(error);
    if (response) return response;
    throw error;
  }
}

async function cancelOrder(request, db, userId) {
  const body = await readBody(request);
  const id = Number(body.id);
  if (!Number.isSafeInteger(id) || id <= 0) return json({ error: 'Valid order id is required.' }, 400);
  const order = await db.prepare(`
    UPDATE orders SET status = 'cancelled'
    WHERE id = ? AND user_id = ? AND status = 'pending'
    RETURNING id
  `).bind(id, userId).first();
  if (!order) return json({ error: 'Pending order not found.' }, 404);
  return json({ ok: true });
}

async function updatePosition(request, db, userId) {
  const body = await readBody(request);
  const id = Number(body.id);
  if (!Number.isSafeInteger(id) || id <= 0) return json({ error: 'Valid position id is required.' }, 400);
  const stopLoss = nullablePositiveNumber(body.stop_loss, 'stop_loss');
  const takeProfit = nullablePositiveNumber(body.take_profit, 'take_profit');
  if (stopLoss.error) return json({ error: stopLoss.error }, 400);
  if (takeProfit.error) return json({ error: takeProfit.error }, 400);
  const position = await db.prepare(`
    UPDATE positions SET stop_loss = ?, take_profit = ?
    WHERE id = ? AND user_id = ? AND status = 'open'
    RETURNING *
  `).bind(stopLoss.value, takeProfit.value, id, userId).first();
  return position ? json(position) : json({ error: 'Open position not found.' }, 404);
}

async function closePosition(request, env, userId) {
  const db = env.DB;
  const body = await readBody(request);
  const id = Number(body.id);
  if (!Number.isSafeInteger(id) || id <= 0) return json({ error: 'Valid position id is required.' }, 400);
  const position = await db.prepare(`
    SELECT p.id, p.user_id, p.market_id, p.symbol, p.side, p.quantity, p.entry_price, p.current_price, p.margin,
      COALESCE(m.price, p.current_price) AS close_price
    FROM positions p LEFT JOIN markets m ON m.id = p.market_id
    WHERE p.id = ? AND p.user_id = ? AND p.status = 'open'
  `).bind(id, userId).first();
  if (!position) return json({ error: 'Open position not found.' }, 404);

  let liveQuote = null;
  if (position.symbol === 'BTCUSD') {
    try {
      liveQuote = await getLiveMarketQuote('BTCUSD');
    } catch (error) {
      console.error('[worker/private-api] Live BTC quote unavailable for close', error?.message || error);
      return json({ error: 'Live BTC pricing is temporarily unavailable. Try again before closing this position.' }, 503);
    }
  }
  const closePrice = Number(liveQuote?.price ?? position.close_price);
  if (!Number.isFinite(closePrice) || closePrice <= 0) return json({ error: 'Unable to determine a valid close price.' }, 409);
  const direction = ['long', 'buy'].includes(position.side) ? 1 : -1;
  const pnl = (closePrice - Number(position.entry_price)) * Number(position.quantity) * direction;
  const closeOperationId = `position-close-${id}`;

  try {
    const results = await db.batch([
      db.prepare(`
        UPDATE positions
        SET status = 'closed', current_price = ?, pnl = ?, closed_at = CURRENT_TIMESTAMP
        WHERE id = ? AND user_id = ? AND status = 'open'
      `).bind(closePrice, pnl, id, userId),
      db.prepare(`
        INSERT INTO position_settlements (position_id, user_id, margin_released, pnl, net_change)
        SELECT id, user_id, margin, pnl, margin + pnl FROM positions
        WHERE id = ? AND user_id = ? AND status = 'closed' AND changes() = 1
        ON CONFLICT(position_id) DO NOTHING
      `).bind(id, userId),
      db.prepare(`
        UPDATE wallets
        SET available = available + (SELECT net_change FROM position_settlements WHERE position_id = ?),
            reserved = MAX(0, reserved - (SELECT margin_released FROM position_settlements WHERE position_id = ?))
        WHERE user_id = ? AND currency = 'USD' AND changes() = 1
      `).bind(id, id, userId),
      db.prepare(`
        INSERT OR IGNORE INTO wallet_ledger (user_id, currency, entry_type, amount, source_type, source_id)
        SELECT user_id, 'USD', CASE WHEN net_change > 0 THEN 'credit' ELSE 'debit' END,
          ABS(net_change), 'position_close', position_id
        FROM position_settlements
        WHERE position_id = ? AND net_change != 0 AND changes() = 1
      `).bind(id),
      db.prepare(`
        INSERT OR IGNORE INTO orders
          (user_id, market_id, symbol, side, type, quantity, price, status, filled_price, operation_id)
        SELECT ?, ?, ?, ?, 'close', ?, ?, 'filled', ?, ?
        FROM position_settlements WHERE position_id = ?
      `).bind(userId, position.market_id, position.symbol, direction === 1 ? 'sell' : 'buy', position.quantity, closePrice, closePrice, closeOperationId, id),
      db.prepare(`
        INSERT INTO notifications (user_id, title, body, read)
        SELECT ?, 'Closed ' || ?, 'Realized P&L ' || CASE WHEN ? >= 0 THEN '+' ELSE '' END || CAST(? AS TEXT) || ' USD at ' || CAST(? AS TEXT), 0
        WHERE changes() = 1
      `).bind(userId, position.symbol, pnl, pnl, closePrice),
    ]);
    if (Number(results[0]?.meta?.changes || 0) !== 1) return json({ error: 'Open position was already closed.' }, 409);
    const closed = await db.prepare('SELECT * FROM positions WHERE id = ? AND user_id = ?')
      .bind(id, userId).first();
    await sendUserEmail(env, userId, {
      subject: `Closed ${position.symbol} position`,
      text: `Your ${position.symbol} position closed at ${closePrice}. Realized P&L: ${pnl.toFixed(2)} USD.`,
    }, 'worker/private-api');
    return json(closed);
  } catch (error) {
    const response = orderErrorResponse(error);
    if (response) return response;
    throw error;
  }
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
    if (pathname === '/api/investments') return await handleInvestments(request, env, user.id);
    if (pathname === '/api/positions' && request.method === 'GET') return await listPositions(request, env.DB, user.id);
    if (pathname === '/api/positions' && request.method === 'PUT') return await updatePosition(request, env.DB, user.id);
    if (pathname === '/api/positions' && request.method === 'DELETE') return await closePosition(request, env, user.id);
    if (pathname === '/api/orders' && request.method === 'GET') return await listOrders(env.DB, user.id);
    if (pathname === '/api/orders' && request.method === 'POST') return await createOrder(request, env, user.id);
    if (pathname === '/api/orders' && request.method === 'DELETE') return await cancelOrder(request, env.DB, user.id);
    if (pathname === '/api/notifications') return await handleNotifications(request, env.DB, user.id);
    if (pathname === '/api/watchlist') return await handleWatchlist(request, env.DB, user.id);
    return json({ error: 'Not found' }, 404);
  } catch (error) {
    console.error('[worker/private-api]', error);
    return json({ error: 'Internal server error' }, 500);
  }
}
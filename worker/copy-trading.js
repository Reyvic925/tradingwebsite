import { getAuthenticatedUser } from './auth.js';
import { validateCopyRisk, valueCopy } from '../shared/copy-risk.js';
import { normalizeSyntheticConfig, simulateTick } from '../api-handlers/synthetic-simulation.js';

const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
const rowToFollow = row => ({ ...row, is_copying: row.status !== 'stopped',
  pnl: Number((row.current_value - row.allocated_amount).toFixed(2)),
  pnl_percent: (row.current_value / row.allocated_amount - 1) * 100,
  drawdown_percent: row.peak_value > 0 ? (row.peak_value - row.current_value) / row.peak_value * 100 : 0 });
const statement = (db, sql, ...args) => db.prepare(sql).bind(...args);

// Optimistic revision + unique event IDs make retries and overlapping ticks safe.
export async function applyCopyEvent(db, follow, result, event, position = undefined) {
  if (await statement(db, 'SELECT id FROM copy_activity WHERE id=?', event.id).first()) return false;
  const guard = `EXISTS (SELECT 1 FROM copy_follows WHERE id = ? AND revision = ? AND status <> 'stopped')`;
  const status = result.reason ? 'stopped' : (event.status || follow.status);
  const values = [follow.id, follow.revision];
  const statements = [
    statement(db, `INSERT OR IGNORE INTO copy_activity
      (id,follow_id,kind,symbol,side,quantity,entry_price,exit_price,gross_pnl,fees,net_pnl,trade_pnl,value_after,reason,created_at)
      SELECT ?,?,?,?,?,?,?,?,?,?,?,?,?,?,? WHERE ${guard}`,
      event.id, follow.id, event.kind, event.symbol || null, event.side || null, event.quantity ?? null,
      event.entry_price ?? null, event.exit_price ?? null,
      result.value - follow.current_value + result.fee, result.fee, result.value - follow.current_value,
      event.trade_pnl ?? null, result.value, result.reason || event.reason, event.at, ...values),
  ];
  if (position) statements.push(statement(db, `INSERT INTO copy_positions
    (follow_id,event_id,symbol,side,quantity,entry_price,mark_price,total_fees) SELECT ?,?,?,?,?,?,?,? WHERE ${guard}
    ON CONFLICT(follow_id) DO UPDATE SET mark_price=excluded.mark_price,total_fees=excluded.total_fees`,
    follow.id, position.event_id, position.symbol, position.side, position.quantity, position.entry_price, position.mark_price, position.total_fees || 0, ...values));
  if (position === null || status === 'stopped') statements.push(statement(db,
    `DELETE FROM copy_positions WHERE follow_id=? AND ${guard}`, follow.id, ...values));
  statements.push(
    statement(db, `UPDATE copy_follows SET current_value=?, peak_value=?, fee_high_water=?, fees=fees+?,
      status=?,stop_reason=?,revision=revision+1,updated_at=?,last_tick=max(last_tick,?)
      WHERE id=? AND revision=? AND status <> 'stopped'
      AND EXISTS (SELECT 1 FROM copy_activity WHERE id=? AND follow_id=?)`,
      result.value, result.peak, result.feeHighWater, result.fee, status,
      result.reason || (status === 'stopped' ? event.reason : null), event.at, event.tick || 0, ...values, event.id, follow.id),
  );
  const batch = await db.batch(statements);
  return Number(batch.at(-1).meta?.changes || 0) > 0;
}

async function listFollows(db, userId, history = false) {
  const { results } = await statement(db, `SELECT * FROM copy_follows WHERE user_id=? ${history ? '' : "AND status <> 'stopped'"} ORDER BY followed_at DESC`, userId).all();
  const { results: traders } = await db.prepare('SELECT * FROM traders').all();
  const byId = new Map((traders || []).map(t => [t.id, { ...t, is_active: Boolean(t.is_active), asset_focus: JSON.parse(t.asset_focus) }]));
  return (results || []).map(row => ({ ...rowToFollow(row), trader: byId.get(row.trader_id) }));
}

export async function handleCopyRequest(request, env) {
  const url = new URL(request.url);
  try {
    const user = await getAuthenticatedUser(request, env);
    if (!user) return json({ error: 'Unauthorized' }, 401);
    const db = env.DB;
    if (url.pathname === '/api/copy-activity' && request.method === 'GET') {
      const id = url.searchParams.get('followId');
      const { results } = await statement(db, `SELECT a.*,t.name AS trader_name FROM copy_activity a
        JOIN copy_follows f ON f.id=a.follow_id JOIN traders t ON t.id=f.trader_id
        WHERE f.user_id=? AND (? IS NULL OR f.id=?) ORDER BY a.created_at DESC,a.rowid DESC LIMIT 200`, user.id, id, id).all();
      return json(results || []);
    }
    if (url.pathname === '/api/copy-summary' && request.method === 'GET') {
      const follows = await listFollows(db, user.id);
      const total_invested = follows.reduce((n, f) => n + f.allocated_amount, 0);
      const total_current = follows.reduce((n, f) => n + f.current_value, 0);
      return json({ total_invested, total_current, total_pnl: total_current - total_invested,
        total_pnl_percent: total_invested ? (total_current / total_invested - 1) * 100 : 0, count: follows.length });
    }
    if (url.pathname !== '/api/copy-trades') return json({ error: 'Method not allowed' }, 405);
    if (request.method === 'GET') return json(await listFollows(db, user.id, url.searchParams.get('history') === '1'));
    if (request.method === 'POST') {
      const body = await request.json();
      const amount = Number(body.allocated_amount);
      const traderId = Number(body.trader_id);
      if (!Number.isSafeInteger(traderId) || traderId < 1 || !Number.isFinite(amount) || amount < 100 || amount > 1e9 || Math.abs(amount * 100 - Math.round(amount * 100)) > 1e-5) return json({ error: 'Enter a valid allocation of at least $100, in cents.' }, 400);
      const risk = validateCopyRisk(body);
      const trader = await statement(db, 'SELECT * FROM traders WHERE id=? AND is_active=1', traderId).first();
      if (!trader) return json({ error: 'Trader is not accepting new copies.' }, 409);
      const id = crypto.randomUUID();
      const at = new Date().toISOString();
      await db.batch([
        statement(db, `INSERT INTO copy_follows (id,user_id,trader_id,allocated_amount,current_value,peak_value,fee_high_water,
          stop_loss_percent,take_profit_percent,leverage_multiplier,followed_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
          id, user.id, traderId, amount, amount, amount, amount, risk.stop_loss_percent, risk.take_profit_percent, risk.leverage_multiplier, at, at),
        statement(db, `INSERT INTO copy_activity (id,follow_id,kind,value_after,reason,created_at) VALUES (?,?,'started',?,'allocation',?)`, `${id}:start`, id, amount, at),
      ]);
      return json({ id }, 201);
    }
    const follow = await statement(db, 'SELECT * FROM copy_follows WHERE id=? AND user_id=?', url.searchParams.get('id'), user.id).first();
    if (!follow) return json({ error: 'Copy not found' }, 404);
    if (follow.status === 'stopped') return request.method === 'DELETE' ? json({ ok: true }) : json({ error: 'This copy has stopped.' }, 409);
    if (request.method === 'DELETE') {
      const position = await statement(db, 'SELECT * FROM copy_positions WHERE follow_id=?', follow.id).first();
      const executionFee = position ? position.quantity * position.mark_price * 0.0001 : 0;
      const exit = position ? position.mark_price * (1 + (position.side === 'BUY' ? -1 : 1) * 0.0002) : 0;
      const delta = position ? (position.side === 'BUY' ? 1 : -1) * (exit - position.mark_price) * position.quantity - executionFee : 0;
      const result = valueCopy(follow, follow.current_value > 0 ? delta / follow.current_value / follow.leverage_multiplier : 0);
      result.fee += executionFee;
      result.reason = 'user_stopped';
      const applied = await applyCopyEvent(db, follow, result, { id: `${follow.id}:stop:${follow.revision}`, kind: 'stopped', reason: 'user_stopped',
        trade_pnl: position ? (position.side === 'BUY' ? 1 : -1) * (exit - position.entry_price) * position.quantity - position.total_fees - result.fee : null,
        symbol: position?.symbol, side: position?.side, quantity: position?.quantity, entry_price: position?.entry_price, exit_price: position ? exit : null, at: new Date().toISOString() });
      return applied ? json({ ok: true }) : json({ error: 'Copy changed. Refresh and retry.' }, 409);
    }
    if (request.method === 'PUT') {
      const body = await request.json();
      if (body.status !== undefined && !['active', 'paused'].includes(body.status)) return json({ error: 'Invalid copy status' }, 400);
      const risk = validateCopyRisk({ ...follow, ...body });
      const result = valueCopy({ ...follow, ...risk }, 0);
      if (result.reason) return json({ error: 'These limits are already reached. Close this copy or choose wider limits.' }, 400);
      const at = new Date().toISOString();
      const eventId = `${follow.id}:settings:${follow.revision}`;
      // Settings and the revision check are one atomic transaction.
      const changes = await db.batch([
        statement(db, `UPDATE copy_follows SET stop_loss_percent=?,take_profit_percent=?,leverage_multiplier=?,
          status=?,stop_reason=?,revision=revision+1,updated_at=? WHERE id=? AND revision=? AND status <> 'stopped'`,
          risk.stop_loss_percent, risk.take_profit_percent, risk.leverage_multiplier,
          result.reason ? 'stopped' : body.status || follow.status, result.reason, at, follow.id, follow.revision),
        statement(db, `INSERT OR IGNORE INTO copy_activity (id,follow_id,kind,value_after,reason,created_at)
          SELECT ?,?,'settings',?,?,? WHERE changes()=1`, eventId, follow.id, follow.current_value,
          result.reason || (body.status === 'paused' ? 'paused' : body.status === 'active' ? 'resumed' : 'risk_updated'), at),
      ]);
      return changes[0].meta?.changes ? json({ ok: true }) : json({ error: 'Copy changed. Refresh and retry.' }, 409);
    }
    return json({ error: 'Method not allowed' }, 405);
  } catch (error) {
    const message = String(error?.message || error);
    if (/Insufficient balance|UNIQUE constraint|Maximum drawdown|Profit target|Trade multiplier/i.test(message)) return json({ error: /UNIQUE/.test(message) ? 'You already copy this trader.' : message }, 400);
    console.error('[copy-trading]', error);
    return json({ error: 'Copy trading is unavailable. Please retry.' }, 503);
  }
}

export async function runCopyTradingTick(env, now = new Date()) {
  const db = env.DB;
  const tick = Math.floor(now.getTime() / 300000);
  const at = new Date(tick * 300000).toISOString();
  const { results: traders } = await db.prepare("SELECT * FROM traders WHERE is_active=1 OR EXISTS (SELECT 1 FROM copy_follows WHERE trader_id=traders.id AND status<>'stopped')").all();
  for (const trader of traders || []) {
    const strategies = ['momentum', 'mean_reversion', 'scalper', 'swing', 'conservative'];
    const config = normalizeSyntheticConfig({ assets: JSON.parse(trader.asset_focus), session: trader.session_type, startingEquity: trader.current_equity / Math.max(0.0001, 1 + trader.total_return / 100),
      strategyType: strategies[trader.id % strategies.length], riskProfile: trader.risk_score });
    await statement(db, `INSERT OR IGNORE INTO copy_simulation_state (trader_id,config,state) VALUES (?,?,?)`,
      trader.id, JSON.stringify(config), JSON.stringify({ equity: trader.current_equity, peakEquity: trader.current_equity, prices: {} })).run();
    const simulation = await statement(db, 'SELECT * FROM copy_simulation_state WHERE trader_id=?', trader.id).first();
    if (simulation.last_tick < tick) {
      const before = JSON.parse(simulation.state);
      const config = JSON.parse(simulation.config);
      const result = simulateTick({ traderId: trader.id, tickId: tick, timestamp: at, config: { ...config, tradingEnabled: Boolean(trader.is_active) }, state: before });
      const change = before.equity > 0 ? (result.state.equity - before.equity) / before.equity : 0;
      const guard = 'EXISTS (SELECT 1 FROM copy_simulation_state WHERE trader_id=? AND last_tick=?)';
      const guardArgs = [trader.id, simulation.last_tick];
      const batch = [statement(db, `INSERT OR IGNORE INTO copy_simulation_ticks (trader_id,tick,change,detail,created_at)
        SELECT ?,?,?,?,? WHERE ${guard}`, trader.id, tick, change, JSON.stringify(result), at, ...guardArgs)];
      const position = result.state.position;
      const openPnl = position ? (position.side === 'BUY' ? 1 : -1) * (result.state.prices[position.symbol] - position.entry_price) * position.quantity - position.entry_fee : 0;
      const markedTrade = position ? { ...position, pnl: openPnl, pnl_percent: openPnl / position.equity_at_entry * 100, fees: position.entry_fee } : null;
      for (const trade of [result.trade || markedTrade].filter(Boolean)) {
        batch.push(statement(db, `INSERT INTO trader_trades
          (trader_id,event_id,symbol,side,quantity,entry_price,exit_price,pnl,pnl_percent,status,traded_at,closed_at,fees,close_reason)
          SELECT ?,?,?,?,?,?,?,?,?,?,?,?,?,? WHERE ${guard}
          ON CONFLICT(event_id) WHERE event_id IS NOT NULL DO UPDATE SET exit_price=excluded.exit_price,pnl=excluded.pnl,
            pnl_percent=excluded.pnl_percent,status=excluded.status,closed_at=excluded.closed_at,fees=excluded.fees,close_reason=excluded.close_reason`,
          trader.id, trade.event_id, trade.symbol, trade.side, trade.quantity, trade.entry_price, trade.exit_price ?? null,
          trade.pnl ?? 0, trade.pnl_percent ?? 0, trade.status, trade.traded_at, trade.closed_at ?? null, trade.fees || 0, trade.close_reason || null, ...guardArgs));
      }
      batch.push(statement(db, `INSERT INTO trader_history (trader_id,snapshot_date,equity,daily_return)
        SELECT ?,?,?,? WHERE ${guard} ON CONFLICT(trader_id,snapshot_date) DO UPDATE SET equity=excluded.equity,daily_return=excluded.daily_return`,
        trader.id, at.slice(0, 10), result.state.equity, change * 100, ...guardArgs));
      batch.push(statement(db, `UPDATE traders SET current_equity=?,total_return=?,max_drawdown=max(max_drawdown,?),updated_at=?
        WHERE id=? AND ${guard}`, result.state.equity, (result.state.equity / config.startingEquity - 1) * 100,
        result.state.maxDrawdown, at, trader.id, ...guardArgs));
      batch.push(statement(db, `UPDATE copy_simulation_state SET last_tick=?,state=? WHERE trader_id=? AND last_tick=?`, tick, JSON.stringify(result.state), ...guardArgs));
      await db.batch(batch);
    }
    const stored = await statement(db, 'SELECT * FROM copy_simulation_ticks WHERE trader_id=? AND tick=?', trader.id, tick).first();
    if (!stored) continue;
    const detail = JSON.parse(stored.detail);
    const { results: follows } = await statement(db, `SELECT * FROM copy_follows WHERE trader_id=? AND status<>'stopped' AND followed_at < ?`, trader.id, at).all();
    for (const follow of follows || []) {
      if (follow.last_tick >= tick) continue;
      const id = `${follow.id}:${tick}`;
      if (await statement(db, 'SELECT id FROM copy_activity WHERE id=?', id).first()) continue;
      let position = await statement(db, 'SELECT * FROM copy_positions WHERE follow_id=?', follow.id).first();
      let delta = 0;
      let executionFees = 0;
      let kind = 'valuation';
      let closeReason;
      let trade = position;
      let nextPosition;
      if (position) {
        const price = detail.state.prices[position.symbol];
        if (!Number.isFinite(price)) continue;
        const leadTrade = await statement(db, 'SELECT status,exit_price,close_reason FROM trader_trades WHERE event_id=?', position.event_id).first();
        const closing = leadTrade?.status === 'CLOSED';
        const mark = closing ? leadTrade.exit_price : price;
        if (closing) closeReason = leadTrade.close_reason;
        delta = (position.side === 'BUY' ? 1 : -1) * (mark - position.mark_price) * position.quantity;
        executionFees = closing ? mark * position.quantity * 0.0001 : 0;
        trade = { ...position, exit_price: mark };
        nextPosition = closing ? null : { ...position, mark_price: mark };
        if (closing) kind = 'closed';
      } else if (detail.openedTrade && follow.status === 'active') {
        const opened = detail.openedTrade;
        const quantity = opened.quantity * follow.current_value / opened.equity_at_entry * follow.leverage_multiplier;
        const mark = detail.state.prices[opened.symbol];
        position = { ...opened, quantity, mark_price: mark };
        delta = (opened.side === 'BUY' ? 1 : -1) * (mark - opened.entry_price) * quantity;
        executionFees = opened.entry_price * quantity * 0.0001;
        trade = { ...position, exit_price: mark };
        nextPosition = position;
        kind = 'opened';
      } else continue;
      const effectiveChange = follow.current_value > 0 ? (delta - executionFees) / follow.current_value / follow.leverage_multiplier : 0;
      let value = valueCopy(follow, effectiveChange, trader.profit_sharing_fee);
      if (value.reason && nextPosition) {
        const reason = value.reason;
        const mark = nextPosition.mark_price;
        const exit = mark * (1 + (nextPosition.side === 'BUY' ? -1 : 1) * 0.0002);
        const closeFee = exit * nextPosition.quantity * 0.0001;
        delta += (nextPosition.side === 'BUY' ? 1 : -1) * (exit - mark) * nextPosition.quantity;
        executionFees += closeFee;
        value = valueCopy(follow, follow.current_value > 0 ? (delta - executionFees) / follow.current_value / follow.leverage_multiplier : 0, trader.profit_sharing_fee);
        value.reason = reason;
        trade = { ...trade, exit_price: exit };
        nextPosition = null;
        kind = 'stopped';
      }
      value.fee += executionFees;
      if (nextPosition) nextPosition.total_fees = Number(position?.total_fees || 0) + value.fee;
      await applyCopyEvent(db, follow, value, { id, at, kind, tick,
        trade_pnl: nextPosition === null ? (trade.side === 'BUY' ? 1 : -1) * (trade.exit_price - trade.entry_price) * trade.quantity - Number(position?.total_fees || 0) - value.fee : null,
        symbol: trade.symbol, side: trade.side, quantity: trade.quantity,
        entry_price: trade.entry_price, exit_price: trade.exit_price,
        reason: closeReason || (kind === 'opened' ? 'strategy_entry' : 'market_move') }, nextPosition);
    }
    await statement(db, `UPDATE traders SET total_trades=(SELECT count(*) FROM trader_trades WHERE trader_id=? AND status='CLOSED'),
      win_rate_trades=coalesce((SELECT 100.0*sum(pnl>0)/nullif(count(*),0) FROM trader_trades WHERE trader_id=? AND status='CLOSED'),0),
      copiers_current=(SELECT count(*) FROM copy_follows WHERE trader_id=? AND status<>'stopped'),
      under_management=coalesce((SELECT sum(current_value) FROM copy_follows WHERE trader_id=? AND status<>'stopped'),0) WHERE id=?`,
      trader.id, trader.id, trader.id, trader.id, trader.id).run();
  }
  await statement(db, 'DELETE FROM copy_simulation_ticks WHERE tick < ?', tick - 576).run();
}

import { getD1Admin } from './admin-auth.js';
import { normalizeAssetFocus, validateTraderRecord } from '../api-handlers/trader-validation.js';
import { compareHistory } from '../shared/trader-comparison.js';
import { calculateTraderAnalytics, calculateTraderExposure } from '../shared/trader-analytics.js';
import { getAuthenticatedUser } from './auth.js';
import { loadCopyQuotes } from './copy-quotes.js';

const TRADER_FIELDS = [
  'name', 'country', 'avatar_url', 'bio', 'specialty', 'asset_focus',
  'session_type', 'current_equity', 'total_return', 'daily_return',
  'monthly_return', 'total_trades', 'win_rate_trades', 'max_drawdown',
  'volatility', 'drift', 'risk_score', 'risk_level', 'badge', 'followers',
  'copiers_current', 'copiers_all_time', 'under_management',
  'profit_for_copiers', 'profit_sharing_fee', 'is_active', 'session_start',
  'session_end',
];

const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  },
});

function parseTrader(row) {
  let assetFocus = row.asset_focus;
  try {
    assetFocus = JSON.parse(assetFocus);
  } catch {
    assetFocus = String(assetFocus || '').split(',');
  }
  return {
    ...row,
    ...(row.performance_started_at ? {
      monthly_return: row.performance_started_at.slice(0, 10) > `${new Date().toISOString().slice(0, 7)}-01` ? null : row.monthly_return,
    } : {}),
    asset_focus: normalizeAssetFocus(assetFocus),
    is_active: row.is_active === true || row.is_active === 1,
  };
}

function parseId(value) {
  const id = String(value || '');
  if (!/^\d+$/.test(id)) return null;
  const number = Number(id);
  return Number.isSafeInteger(number) && number > 0 ? number : null;
}

async function readBody(request) {
  try {
    const body = await request.json();
    return body && typeof body === 'object' && !Array.isArray(body) ? body : {};
  } catch {
    return {};
  }
}

function resolveAvatar(body, fallback = '') {
  if (typeof body.avatar_data !== 'string' || !body.avatar_data) {
    return String(body.avatar_url || fallback);
  }
  const match = body.avatar_data.match(/^data:image\/(?:png|jpeg|jpg|webp|gif);base64,([A-Za-z0-9+/]+={0,2})$/i);
  if (!match) throw new Error('Avatar must be a valid PNG, JPG, WEBP, or GIF image');
  const encoded = match[1];
  const padding = encoded.endsWith('==') ? 2 : encoded.endsWith('=') ? 1 : 0;
  const bytes = Math.floor(encoded.length * 3 / 4) - padding;
  if (bytes < 1 || bytes > 384 * 1024) throw new Error('Avatar must be smaller than 384 KB');
  return body.avatar_data;
}

function normalizeWrite(input, existing = {}) {
  const changes = {};
  for (const field of TRADER_FIELDS) {
    if (Object.hasOwn(input, field)) changes[field] = input[field];
  }
  if (Object.hasOwn(input, 'avatar_data')) changes.avatar_url = resolveAvatar(input, existing.avatar_url);
  if (Object.hasOwn(changes, 'asset_focus')) {
    changes.asset_focus = normalizeAssetFocus(changes.asset_focus);
  }
  if (Object.hasOwn(changes, 'is_active') && typeof changes.is_active !== 'boolean') {
    throw new Error('is_active must be a boolean');
  }
  if (Object.hasOwn(changes, 'session_start') && changes.session_start === '') delete changes.session_start;
  if (Object.hasOwn(changes, 'session_end') && changes.session_end === '') changes.session_end = null;

  const candidate = validateTraderRecord({ ...existing, ...changes });
  return Object.fromEntries(Object.entries(changes).map(([field, value]) => [
    field,
    field === 'asset_focus' ? JSON.stringify(candidate.asset_focus)
      : field === 'is_active' ? Number(value)
        : value,
  ]));
}

async function listTraders(request, env, url) {
  const includeInactive = url.searchParams.get('include_inactive') === '1';
  if (includeInactive && !(await getD1Admin(request, env))) {
    return json({ error: 'Admin access required' }, 403);
  }

  const conditions = [];
  const values = [];
  const idValue = url.searchParams.get('id');
  if (idValue !== null) {
    const id = parseId(idValue);
    if (!id) return json({ error: 'Trader ID must be an integer' }, 400);
    conditions.push('id = ?');
    values.push(id);
  }
  if (!includeInactive) conditions.push('is_active = 1');

  const session = url.searchParams.get('session');
  if (session) {
    conditions.push('session_type = ?');
    values.push(session);
  }
  const asset = url.searchParams.get('asset');
  if (asset) {
    conditions.push('EXISTS (SELECT 1 FROM json_each(traders.asset_focus) WHERE value = ?)');
    values.push(asset);
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const result = await env.DB.prepare(`
    SELECT * FROM traders ${where}
    ORDER BY total_return DESC, id ASC
  `).bind(...values).all();
  return json((result.results || []).map(parseTrader));
}

async function createTrader(request, env) {
  if (!(await getD1Admin(request, env))) return json({ error: 'Admin access required' }, 403);
  const body = await readBody(request);
  if (!String(body.name || '').trim()) return json({ error: 'Trader name is required' }, 400);
  let values;
  try {
    values = normalizeWrite({
      ...body,
      avatar_url: resolveAvatar(body),
      is_active: true,
      asset_focus: body.asset_focus || ['BTC-USD', 'ETH-USD'],
    });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Invalid trader data' }, 400);
  }
  const fields = Object.keys(values);
  try {
    const result = await env.DB.prepare(`
      INSERT INTO traders (${fields.join(', ')})
      VALUES (${fields.map(() => '?').join(', ')})
      RETURNING *
    `).bind(...fields.map((field) => values[field])).first();
    return json(parseTrader(result), 201);
  } catch (error) {
    if (/unique constraint/i.test(String(error?.message || error))) {
      if (/avatar_url/i.test(String(error?.message || error))) {
        return json({ error: 'That photo is already assigned to another trader' }, 409);
      }
      return json({ error: 'A trader with that name already exists' }, 409);
    }
    throw error;
  }
}

async function updateTrader(request, env, id) {
  if (!(await getD1Admin(request, env))) return json({ error: 'Admin access required' }, 403);
  const existingRow = await env.DB.prepare('SELECT * FROM traders WHERE id = ?').bind(id).first();
  if (!existingRow) return json({ error: 'Trader not found' }, 404);
  let updates;
  try {
    updates = normalizeWrite(await readBody(request), parseTrader(existingRow));
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Invalid trader data' }, 400);
  }
  const fields = Object.keys(updates);
  if (!fields.length) return json({ error: 'No supported trader fields provided' }, 400);
  const assignments = fields.map((field) => `${field} = ?`);
  assignments.push('updated_at = CURRENT_TIMESTAMP');
  try {
    const updated = await env.DB.prepare(`
      UPDATE traders SET ${assignments.join(', ')}
      WHERE id = ?
      RETURNING *
    `).bind(...fields.map((field) => updates[field]), id).first();
    return json(parseTrader(updated));
  } catch (error) {
    if (/unique constraint/i.test(String(error?.message || error))) {
      if (/avatar_url/i.test(String(error?.message || error))) {
        return json({ error: 'That photo is already assigned to another trader' }, 409);
      }
      return json({ error: 'A trader with that name already exists' }, 409);
    }
    throw error;
  }
}

async function setTraderInactive(request, env, id) {
  if (!(await getD1Admin(request, env))) return json({ error: 'Admin access required' }, 403);
  const result = await env.DB.prepare(`
    UPDATE traders SET is_active = 0, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).bind(id).run();
  if (!Number(result.meta?.changes || 0)) return json({ error: 'Trader not found' }, 404);
  return json({ success: true });
}

async function listTraderActivity(env, url, table) {
  const traderId = parseId(url.searchParams.get('traderId'));
  if (!traderId) return json({ error: 'A valid traderId is required' }, 400);
  const limitValue = Number(url.searchParams.get('limit') || 100);
  const limit = Number.isSafeInteger(limitValue) ? Math.min(Math.max(limitValue, 1), 200) : 100;
  const order = table === 'trader_history' ? 'snapshot_date DESC' : 'COALESCE(closed_at, traded_at) DESC, id DESC';
  const result = await env.DB.prepare(`
    SELECT * FROM ${table}
    WHERE trader_id = ?
    ORDER BY ${order}
    LIMIT ?
  `).bind(traderId, limit).all();
  return json((result.results || []).map(row => {
    if (table === 'trader_trades' && ['pending', 'awaiting_history'].includes(row.price_review_status)) {
      return { ...row, entry_price: null, exit_price: null, pnl: null, pnl_percent: null };
    }
    return row;
  }));
}

export async function handleTraderRequest(request, env) {
  const url = new URL(request.url);
  try {
    if (url.pathname === '/api/trader-quotes' && request.method === 'GET') {
      const id = parseId(url.searchParams.get('traderId'));
      if (!id) return json({ error: 'A valid trader ID is required.' }, 400);
      const trader = await env.DB.prepare('SELECT * FROM traders WHERE id=? AND is_active=1').bind(id).first();
      if (!trader) return json({ error: 'Strategy is unavailable.' }, 404);
      const assets = parseTrader(trader).asset_focus;
      const quotes = await loadCopyQuotes(assets);
      return json(assets.map(asset => ({ asset, price: quotes[asset]?.price ?? null,
        source: quotes[asset]?.price_source || 'Unavailable', at: quotes[asset]?.quote_updated_at || null })));
    }
    if (url.pathname === '/api/trader-watchlist') {
      const user = await getAuthenticatedUser(request, env);
      if (!user) return json({ error: 'Sign in to save strategies.' }, 401);
      if (request.method === 'GET') {
        const { results } = await env.DB.prepare('SELECT trader_id FROM trader_watchlists WHERE user_id=? ORDER BY created_at DESC,trader_id').bind(user.id).all();
        return json({ trader_ids: (results || []).map(row => row.trader_id) });
      }
      const id = parseId(url.searchParams.get('traderId'));
      if (!id) return json({ error: 'A valid trader ID is required.' }, 400);
      if (request.method === 'PUT') {
        const trader = await env.DB.prepare('SELECT id FROM traders WHERE id=? AND is_active=1').bind(id).first();
        if (!trader) return json({ error: 'Strategy is unavailable.' }, 404);
        await env.DB.prepare('INSERT OR IGNORE INTO trader_watchlists (user_id,trader_id) VALUES (?,?)').bind(user.id, id).run();
      } else if (request.method === 'DELETE') {
        await env.DB.prepare('DELETE FROM trader_watchlists WHERE user_id=? AND trader_id=?').bind(user.id, id).run();
      } else return json({ error: 'Method not allowed' }, 405);
      return json({ saved: request.method === 'PUT' });
    }
    if (url.pathname === '/api/trader-analytics' && request.method === 'GET') {
      const id = parseId(url.searchParams.get('traderId'));
      if (!id) return json({ error: 'A valid trader ID is required.' }, 400);
      const trader = await env.DB.prepare('SELECT * FROM traders WHERE id=? AND is_active=1').bind(id).first();
      if (!trader) return json({ error: 'Strategy is unavailable.' }, 404);
      const [history, openTrades, simulation, records] = await Promise.all([
        env.DB.prepare('SELECT snapshot_date,equity FROM trader_history WHERE trader_id=? ORDER BY snapshot_date').bind(id).all(),
        env.DB.prepare("SELECT * FROM trader_trades WHERE trader_id=? AND status='OPEN'").bind(id).all(),
        env.DB.prepare('SELECT state FROM copy_simulation_state WHERE trader_id=?').bind(id).first(),
        env.DB.prepare("SELECT min(traded_at) first_trade,max(COALESCE(closed_at,traded_at)) latest_trade,count(*) total,sum(price_basis='market') market_trades FROM trader_trades WHERE trader_id=?").bind(id).first(),
      ]);
      return json({ ...calculateTraderAnalytics(trader, history.results || []),
        exposure: calculateTraderExposure(trader, openTrades.results || [], JSON.parse(simulation?.state || '{}')),
        records, updated_at: trader.updated_at, strategy: trader.bio, specialty: trader.specialty,
        generated_at: new Date().toISOString() });
    }
    if (url.pathname === '/api/trader-comparison' && request.method === 'GET') {
      const ids = [...new Set(String(url.searchParams.get('ids') || '').split(',').map(parseId))];
      const period = Number(url.searchParams.get('period') || 30);
      if (ids.some(id => !id) || ids.length < 1 || ids.length > 3 || ![30, 90].includes(period)) return json({ error: 'Choose one to three traders and a 30 or 90 day period.' }, 400);
      const placeholders = ids.map(() => '?').join(',');
      const [traders, history, trades] = await Promise.all([
        env.DB.prepare(`SELECT * FROM traders WHERE id IN (${placeholders}) AND is_active=1`).bind(...ids).all(),
        env.DB.prepare(`SELECT trader_id,snapshot_date,equity FROM trader_history WHERE trader_id IN (${placeholders}) ORDER BY snapshot_date`).bind(...ids).all(),
        env.DB.prepare(`SELECT trader_id,status,traded_at,closed_at FROM trader_trades WHERE trader_id IN (${placeholders}) AND COALESCE(closed_at,traded_at) >= date('now','-91 days')`).bind(...ids).all(),
      ]);
      const ordered = ids.map(id => (traders.results || []).find(trader => trader.id === id)).filter(Boolean);
      const comparison = compareHistory(ordered, history.results || [], trades.results || [], period);
      comparison.metrics = comparison.metrics.map(metric => {
        const trader = ordered.find(row => row.id === metric.id);
        const start = new Date(Date.now() - period * 86400000).toISOString().slice(0, 10);
        const analytics = calculateTraderAnalytics(trader, (history.results || []).filter(row => row.trader_id === trader.id && row.snapshot_date >= start));
        return { ...metric, sharpe: analytics.sharpe, sortino: analytics.sortino,
          risk_score: trader.risk_score, performance_fee: trader.profit_sharing_fee, specialty: trader.specialty };
      });
      return json(comparison);
    }
    if (url.pathname === '/api/leaderboard' && request.method === 'GET') {
      const { results } = await env.DB.prepare('SELECT * FROM traders WHERE is_active=1 ORDER BY total_return DESC,id LIMIT 20').all();
      return json((results || []).map((row, index) => ({ ...parseTrader(row), rank: index + 1, medal: ['gold','silver','bronze'][index] })));
    }
    if (url.pathname === '/api/traders') {
      if (request.method === 'GET') return await listTraders(request, env, url);
      if (request.method === 'POST') return await createTrader(request, env);
      const id = parseId(url.searchParams.get('id'));
      if (!id) return json({ error: 'A valid trader ID is required' }, 400);
      if (request.method === 'PUT') return await updateTrader(request, env, id);
      if (request.method === 'DELETE') return await setTraderInactive(request, env, id);
      return json({ error: 'Method not allowed' }, 405);
    }
    if (request.method !== 'GET') return json({ error: 'Method not allowed' }, 405);
    if (url.pathname === '/api/trader-trades') return await listTraderActivity(env, url, 'trader_trades');
    if (url.pathname === '/api/trader-history') return await listTraderActivity(env, url, 'trader_history');
    return json({ error: 'Not found' }, 404);
  } catch (error) {
    console.error('[worker/traders-api] Request failed', error);
    return json({ error: 'Trader request failed.' }, 500);
  }
}

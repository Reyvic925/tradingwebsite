import { getD1Admin } from './admin-auth.js';
import { normalizeAssetFocus, validateTraderRecord } from '../api-handlers/trader-validation.js';

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
      avatar_url: resolveAvatar(body, '/images/avatar-1.jpg'),
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
  const order = table === 'trader_history' ? 'snapshot_date DESC' : 'traded_at DESC';
  const result = await env.DB.prepare(`
    SELECT * FROM ${table}
    WHERE trader_id = ?
    ORDER BY ${order}
    LIMIT ?
  `).bind(traderId, limit).all();
  return json(result.results || []);
}

export async function handleTraderRequest(request, env) {
  const url = new URL(request.url);
  try {
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

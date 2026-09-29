const CLASS_MAP = {
  usa: ['stock', 'etf'],
  us: ['stock', 'etf'],
  stock: ['stock', 'etf', 'jp', 'jp-etf', 'ca', 'ca-etf', 'uk', 'uk-etf', 'eu', 'eu-etf', 'de', 'de-etf', 'fr', 'fr-etf', 'in', 'in-etf'],
  equity: ['stock', 'etf', 'jp', 'jp-etf', 'ca', 'ca-etf', 'uk', 'uk-etf', 'eu', 'eu-etf', 'de', 'de-etf', 'fr', 'fr-etf', 'in', 'in-etf'],
  etf: ['etf', 'jp-etf', 'ca-etf', 'uk-etf', 'eu-etf', 'de-etf', 'fr-etf', 'in-etf'],
  futures: ['futures'],
  japan: ['jp', 'jp-etf'],
  jp: ['jp', 'jp-etf'],
  canada: ['ca', 'ca-etf'],
  ca: ['ca', 'ca-etf'],
  uk: ['uk', 'uk-etf'],
  britain: ['uk', 'uk-etf'],
  europe: ['eu', 'eu-etf', 'de', 'de-etf', 'fr', 'fr-etf'],
  eu: ['eu', 'eu-etf'],
  germany: ['de', 'de-etf'],
  de: ['de', 'de-etf'],
  france: ['fr', 'fr-etf'],
  fr: ['fr', 'fr-etf'],
  india: ['in', 'in-etf'],
  in: ['in', 'in-etf'],
  forex: ['forex'],
  crypto: ['crypto'],
};

const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  },
});

export function selectPublicDatabase(env) {
  const mode = String(env.PUBLIC_API_DATABASE || 'production').trim().toLowerCase();
  if (mode === 'production') {
    if (!env.DB) throw new Error('Public API production database binding DB is unavailable.');
    return env.DB;
  }
  if (mode === 'staging') {
    if (!env.STAGING_DB) {
      const error = new Error('Public API staging mode is enabled, but STAGING_DB is unavailable.');
      error.code = 'PUBLIC_API_DATABASE_UNAVAILABLE';
      throw error;
    }
    return env.STAGING_DB;
  }
  throw new Error(`Unsupported PUBLIC_API_DATABASE mode: ${mode || '(empty)'}. Use production or staging.`);
}

async function rows(db, table) {
  const result = await db.prepare(`SELECT * FROM ${table} ORDER BY id ASC`).all();
  return result.results || [];
}

async function landing(db) {
  const [features, partners, stats, plans, testimonials] = await Promise.all([
    rows(db, 'features'),
    rows(db, 'partners'),
    rows(db, 'platform_stats'),
    rows(db, 'plans'),
    rows(db, 'testimonials'),
  ]);
  return json({ features, partners, stats, plans, testimonials });
}

async function plans(db) {
  const result = await db.prepare('SELECT * FROM plans ORDER BY id ASC').all();
  return json(result.results || []);
}

async function investmentTiers(db) {
  const result = await db.prepare(`
    SELECT * FROM investment_tiers
    WHERE simulation_enabled = 1
    ORDER BY tier_level ASC
  `).all();
  return json(result.results || []);
}

async function markets(url, db) {
  const q = String(url.searchParams.get('q') || '').trim().toLowerCase();
  const requestedClass = String(url.searchParams.get('class') || url.searchParams.get('asset_class') || 'all').toLowerCase();
  const assetClasses = requestedClass === 'all' ? null : CLASS_MAP[requestedClass];
  const featured = url.searchParams.get('featured') === '1';
  const limit = Math.min(500, Math.max(1, Number(url.searchParams.get('limit')) || (featured ? 12 : 120)));
  const offset = Math.max(0, Number(url.searchParams.get('offset')) || 0);
  const symbol = String(url.searchParams.get('symbol') || '').trim().toUpperCase();

  const clauses = [];
  const values = [];
  if (q) {
    clauses.push('(lower(symbol) LIKE ? OR lower(name) LIKE ?)');
    values.push(`%${q}%`, `%${q}%`);
  }
  if (symbol) {
    clauses.push('upper(symbol) = ?');
    values.push(symbol);
  }
  if (assetClasses?.length) {
    clauses.push(`asset_class IN (${assetClasses.map(() => '?').join(', ')})`);
    values.push(...assetClasses);
  }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const order = featured ? 'volume DESC, symbol ASC' : 'symbol ASC';
  const countQuery = db.prepare(`SELECT COUNT(*) AS total FROM markets ${where}`).bind(...values);
  const dataQuery = db.prepare(`SELECT id, symbol, name, asset_class, price, change_24h, volume, high_24h, low_24h FROM markets ${where} ORDER BY ${order} LIMIT ? OFFSET ?`).bind(...values, limit, offset);
  const [countResult, dataResult] = await Promise.all([countQuery.first(), dataQuery.all()]);
  return json({
    items: dataResult.results || [],
    total: Number(countResult?.total || 0),
    limit,
    offset,
  });
}

export async function handlePublicRequest(request, env) {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204 });
  if (request.method !== 'GET') return json({ error: 'Method not allowed' }, 405);
  try {
    const url = new URL(request.url);
    const db = selectPublicDatabase(env);
    if (url.pathname === '/api/landing') return await landing(db);
    if (url.pathname === '/api/plans') return await plans(db);
    if (url.pathname === '/api/investment-tiers') return await investmentTiers(db);
    if (url.pathname === '/api/markets') return await markets(url, db);
    return json({ error: 'Not found' }, 404);
  } catch (error) {
    console.error('[worker/public-api]', error);
    if (error?.code === 'PUBLIC_API_DATABASE_UNAVAILABLE') return json({ error: error.message }, 503);
    return json({ error: 'Internal server error' }, 500);
  }
}
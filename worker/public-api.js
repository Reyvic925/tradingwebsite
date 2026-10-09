import { UNIVERSE } from '../api-handlers/universe-data.js';
import { getDefaultPlans } from '../api-handlers/plan-data.js';
import { getLiveMarketQuote } from './market-quotes.js';

const CLASS_MAP = {
  usa: ['stock', 'etf'],
  us: ['stock', 'etf'],
  stocks: ['stock'],
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
  fx: ['forex'],
  crypto: ['crypto'],
};

const DEFAULT_FEATURES = [
  { id: 1, title: 'AI Trading Desk', description: 'Machine-assisted signals and execution routing trained on multi-year market microstructure.', icon: 'ai' },
  { id: 2, title: 'Real-time Analysis', description: 'Streaming books, depth, and volatility surfaces refreshed in milliseconds.', icon: 'analysis' },
  { id: 3, title: 'Multi-asset Access', description: 'Equities, FX, and digital assets from a single margin account.', icon: 'multi' },
  { id: 4, title: 'Risk Management', description: 'Stop-loss, take-profit, and margin safeguards on every ticket.', icon: 'risk' },
  { id: 5, title: '24/7 Support', description: 'Human desk coverage across New York, London, and Singapore sessions.', icon: 'support' },
  { id: 6, title: 'Instant Deposits & Withdrawals', description: 'Card, wire, and stablecoin rails with same-session settlement.', icon: 'deposits' },
  { id: 7, title: 'Referral Program', description: 'Share your code and earn $25 when invited clients fund an account.', icon: 'referral' },
  { id: 8, title: 'Mobile-friendly', description: 'A full terminal experience on any screen, no download required.', icon: 'mobile' },
  { id: 9, title: 'Bank-grade SSL', description: 'TLS 1.3 encryption and hardware-backed session keys.', icon: 'ssl' },
  { id: 10, title: 'Transparent Fees', description: 'Published spreads and commissions. No overnight surprises.', icon: 'fees' },
  { id: 11, title: 'Auto-reinvestment', description: 'Compound matured plan payouts back into the next cycle.', icon: 'reinvest' },
  { id: 12, title: 'Social Trading', description: 'Allocate capital to verified lead traders and copy their book.', icon: 'social' },
];

const DEFAULT_PARTNERS = [
  { id: 1, name: 'JPMorgan', mark: 'JP' },
  { id: 2, name: 'Bloomberg', mark: 'BB' },
  { id: 3, name: 'Nasdaq', mark: 'NQ' },
  { id: 4, name: 'London Stock Exchange', mark: 'LSE' },
  { id: 5, name: 'Mastercard', mark: 'MC' },
  { id: 6, name: 'Amazon Web Services', mark: 'AWS' },
  { id: 7, name: 'Cloudflare', mark: 'CF' },
  { id: 8, name: 'Deutsche Bank', mark: 'DB' },
  { id: 9, name: 'BlackRock', mark: 'BR' },
];

const DEFAULT_STATS = [
  { id: 1, label: 'Active clients', value: 120000, suffix: '+' },
  { id: 2, label: 'Client deposits', value: 420, prefix: '$', suffix: 'M+' },
  { id: 3, label: 'Daily trades', value: 24, suffix: 'K+' },
  { id: 4, label: 'Platform uptime', value: 99.9, suffix: '%' },
];

const DEFAULT_TESTIMONIALS = [
  { id: 1, name: 'Marcus Hale', country: 'United States', amount: 184200, quote: 'The desk feels like a bulge-bracket prime.', video_url: '/videos/testimonial-1.mp4', avatar_url: '/images/avatar-1.jpg', role: 'Family office principal' },
  { id: 2, name: 'Elena Voss', country: 'Germany', amount: 96250, quote: 'Stop-loss filled within a tick of my level.', video_url: '/videos/testimonial-2.mp4', avatar_url: '/images/avatar-2.jpg', role: 'Systematic trader' },
  { id: 3, name: 'Kenji Nakamura', country: 'Japan', amount: 241800, quote: 'Gold plan compounded exactly as advertised.', video_url: '/videos/testimonial-3.mp4', avatar_url: '/images/avatar-3.jpg', role: 'Private investor' },
  { id: 4, name: 'Sofia Alvarez', country: 'Spain', amount: 67340, quote: 'Copying two lead traders while I run FX.', video_url: '/videos/testimonial-4.mp4', avatar_url: '/images/avatar-4.jpg', role: 'FX specialist' },
];

function defaultMarkets() {
  const seen = new Set();
  const list = [];
  for (const market of UNIVERSE || []) {
    const symbol = String(market?.symbol || '').trim();
    if (!symbol || seen.has(symbol)) continue;
    seen.add(symbol);
    list.push({
      id: list.length + 1,
      symbol,
      name: String(market?.name || symbol),
      asset_class: String(market?.asset_class || 'stock'),
      price: Number(market?.price || 0),
      change_24h: Number(market?.change_24h || 0),
      volume: Number(market?.volume || 0),
      high_24h: Number(market?.high_24h || 0),
      low_24h: Number(market?.low_24h || 0),
    });
    if (list.length >= 24) break;
  }
  if (!list.length) {
    return [
      { id: 1, symbol: 'NVDA', name: 'NVIDIA', asset_class: 'stock', price: 131.05, change_24h: 1.84, volume: 42000000, high_24h: 132.2, low_24h: 127.9 },
      { id: 2, symbol: 'AAPL', name: 'Apple', asset_class: 'stock', price: 228.2, change_24h: 0.92, volume: 27100000, high_24h: 230.1, low_24h: 224.8 },
      { id: 3, symbol: 'EURUSD', name: 'Euro / US Dollar', asset_class: 'forex', price: 1.0863, change_24h: 0.12, volume: 96000000, high_24h: 1.0884, low_24h: 1.0827 },
      { id: 4, symbol: 'BTCUSD', name: 'Bitcoin / US Dollar', asset_class: 'crypto', price: 67380, change_24h: 2.15, volume: 31000000000, high_24h: 68200, low_24h: 64600 },
      { id: 5, symbol: 'ETHUSD', name: 'Ethereum / US Dollar', asset_class: 'crypto', price: 3491.1, change_24h: 1.7, volume: 18000000000, high_24h: 3565, low_24h: 3342 },
      { id: 6, symbol: 'XAUUSD', name: 'Gold / US Dollar', asset_class: 'forex', price: 4300, change_24h: 1.52, volume: 12800000, high_24h: 4314, low_24h: 4238 },
    ];
  }
  return list;
}

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
  const [features, partners, stats, plansResult, testimonials] = await Promise.all([
    rows(db, 'features'),
    rows(db, 'partners'),
    rows(db, 'platform_stats'),
    rows(db, 'plans'),
    rows(db, 'testimonials'),
  ]);
  return json({
    features: features.length ? features : DEFAULT_FEATURES,
    partners: partners.length ? partners : DEFAULT_PARTNERS,
    stats: stats.length ? stats : DEFAULT_STATS,
    plans: plansResult.length ? plansResult : getDefaultPlans(),
    testimonials: testimonials.length ? testimonials : DEFAULT_TESTIMONIALS,
  });
}

async function plans(db) {
  const result = await db.prepare('SELECT * FROM plans ORDER BY id ASC').all();
  const rowsResult = result.results || [];
  return json(rowsResult.length ? rowsResult : getDefaultPlans());
}

async function investmentTiers(db) {
  const result = await db.prepare(`
    SELECT * FROM investment_tiers
    WHERE simulation_enabled = 1
    ORDER BY tier_level ASC
  `).all();
  const tiers = result.results || [];
  return json(tiers.length ? tiers : [
    { id: 1, name: 'Starter', tier_level: 1, percent_return: 15, duration_days: 30, min_investment: 200, max_investment: 999, roi_min: 15, roi_max: 22, volatility_min: 5, volatility_max: 10, simulation_enabled: 1 },
    { id: 2, name: 'Silver', tier_level: 2, percent_return: 22, duration_days: 45, min_investment: 1000, max_investment: 4999, roi_min: 22, roi_max: 28, volatility_min: 6, volatility_max: 12, simulation_enabled: 1 },
    { id: 3, name: 'Gold', tier_level: 3, percent_return: 30, duration_days: 60, min_investment: 5000, max_investment: 24999, roi_min: 30, roi_max: 38, volatility_min: 8, volatility_max: 14, simulation_enabled: 1 },
  ]);
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
  const items = dataResult.results && dataResult.results.length ? dataResult.results : defaultMarkets();
  let marketItems = items.map((item) => ({ ...item, price_source: 'D1 reference' }));
  if (symbol) {
    try {
      const quote = await getLiveMarketQuote(symbol);
      marketItems = marketItems.map((item) => item.symbol === symbol ? { ...item, ...quote } : item);
    } catch (error) {
      console.error(`[worker/public-api] Live quote unavailable for ${symbol}`, error?.message || error);
      return json({ error: `Live ${symbol} pricing is temporarily unavailable. Refresh before trading.` }, 503);
    }
  }
  const total = Number(countResult?.total || 0) || items.length;
  return json({
    items: featured && !dataResult.results?.length ? marketItems.slice(0, limit) : marketItems,
    total,
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
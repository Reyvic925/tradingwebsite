import supabase from './db-client.js';

export const DEFAULT_MARKET_FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'usa', label: 'USA' },
  { id: 'japan', label: 'Japan' },
  { id: 'canada', label: 'Canada' },
  { id: 'uk', label: 'UK' },
  { id: 'europe', label: 'Europe' },
  { id: 'germany', label: 'Germany' },
  { id: 'france', label: 'France' },
  { id: 'india', label: 'India' },
  { id: 'etf', label: 'US ETFs' },
  { id: 'forex', label: 'FX' },
  { id: 'crypto', label: 'Crypto' },
];

export function sanitizeMarketFilters(value) {
  const base = Array.isArray(value) ? value : DEFAULT_MARKET_FILTERS;
  const cleaned = base
    .filter((item) => item && typeof item === 'object' && String(item?.id || '').trim())
    .map((item) => ({
      id: String(item.id).trim(),
      label: String(item.label || item.id || 'All').trim() || String(item.id || 'All').trim(),
    }))
    .filter((item) => item.id && item.label);

  const byId = new Map(cleaned.map((item) => [String(item.id).toLowerCase(), item]));
  const merged = [...cleaned];

  for (const item of DEFAULT_MARKET_FILTERS) {
    const key = String(item.id).toLowerCase();
    if (!byId.has(key)) merged.push({ id: String(item.id), label: String(item.label) });
  }

  const deduped = [];
  const seen = new Set();
  for (const item of merged) {
    const id = String(item?.id || '').trim();
    const label = String(item?.label || id || 'All').trim();
    if (!id || !label) continue;
    const key = id.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push({ id, label });
  }

  return deduped;
}

export function mergeMarketFilters(value) {
  return sanitizeMarketFilters(value);
}

export function getMarketFiltersConfig(value) {
  return sanitizeMarketFilters(value);
}

// Initialize default config if needed
async function ensureDefaults() {
  try {
    const { data: existing } = await supabase.from('app_config').select('key, value');
    if (!existing?.length) {
      const defaults = [
        {
          key: 'supported_cryptos',
          value: ['BTC', 'ETH', 'USDT', 'USDC', 'BNB', 'MATIC', 'AVAX', 'ARB', 'OP', 'BASE'],
          description: 'List of production-supported cryptocurrencies for deposits/withdrawals',
        },
        {
          key: 'market_filters',
          value: DEFAULT_MARKET_FILTERS,
          description: 'Market filter options available on Markets page',
        },
        {
          key: 'region_mapping',
          value: {
            us: 'usa',
            jp: 'japan',
            ca: 'canada',
            uk: 'uk',
            eu: 'europe',
            de: 'germany',
            fr: 'france',
            in: 'india',
          },
          description: 'Mapping of region codes to filter IDs',
        },
        {
          key: 'partner_logos',
          value: {
            JPMorgan: '/logos/jpmorgan.svg',
            Bloomberg: '/logos/bloomberg.svg',
            Nasdaq: '/logos/nasdaq.svg',
            'London Stock Exchange': '/logos/lse.svg',
            LSE: '/logos/lse.svg',
            Mastercard: '/logos/mastercard.svg',
            'Amazon Web Services': '/logos/aws.svg',
            AWS: '/logos/aws.svg',
            Cloudflare: '/logos/cloudflare.svg',
            TradingView: '/logos/tradingview.svg',
            'Deutsche Bank': '/logos/deutschebank.svg',
            BlackRock: '/logos/blackrock.svg',
          },
          description: 'Logo URL mappings for partner companies',
        },
      ];

      await supabase.from('app_config').insert(defaults);
      return;
    }

    const byKey = Object.fromEntries((existing || []).map((row) => [row.key, row.value]));
    if (!byKey.market_filters || !Array.isArray(byKey.market_filters) || sanitizeMarketFilters(byKey.market_filters).length !== (byKey.market_filters || []).length) {
      await supabase.from('app_config').upsert({
        key: 'market_filters',
        value: DEFAULT_MARKET_FILTERS,
        description: 'Market filter options available on Markets page',
        updated_at: new Date().toISOString(),
      }).select();
    }
  } catch (err) {
    console.error('[app-config] Failed to ensure defaults:', err.message);
  }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(204).end();

  try {
    // Ensure defaults are set on first request
    await ensureDefaults();

    if (req.method === 'GET') {
      const { key } = req.query;

      if (key) {
        const { data, error } = await supabase
          .from('app_config')
          .select('*')
          .eq('key', key)
          .single();

        if (error) {
          if (error.code === 'PGRST116') {
            if (key === 'market_filters') {
              return res.status(200).json({ key, value: DEFAULT_MARKET_FILTERS, description: 'Market filter options available on Markets page' });
            }
            return res.status(404).json({ error: `Config key "${key}" not found` });
          }
          throw error;
        }

        if (key === 'market_filters') {
          const nextValue = sanitizeMarketFilters(data.value);
          return res.status(200).json({ ...data, value: nextValue });
        }

        return res.status(200).json(data);
      } else {
        // Get all config
        const { data, error } = await supabase.from('app_config').select('*').order('key', { ascending: true });

        if (error) throw error;

        // Return as object keyed by key for easy access
        const result = {};
        data?.forEach((item) => {
          result[item.key] = item.value;
        });

        return res.status(200).json(result);
      }
    }

    if (req.method === 'POST' || req.method === 'PUT') {
      const { key, value, description } = req.body;

      if (!key || !value) {
        return res.status(400).json({ error: 'Missing required fields: key, value' });
      }

      const nextValue = key === 'market_filters' ? sanitizeMarketFilters(value) : value;

      const { data, error } = await supabase
        .from('app_config')
        .upsert({
          key,
          value: nextValue,
          description,
          updated_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (error) throw error;

      return res.status(200).json({ message: `Config "${key}" updated`, data });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('[app-config] API error:', err);
    res.status(500).json({ error: err.message });
  }
}

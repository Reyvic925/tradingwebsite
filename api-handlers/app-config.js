import supabase from './db-client.js';

// Initialize default config if needed
async function ensureDefaults() {
  try {
    const { data: existing } = await supabase.from('app_config').select('key');
    if (!existing?.length) {
      const defaults = [
        {
          key: 'supported_cryptos',
          value: ['BTC', 'ETH', 'USDT', 'USDC', 'BNB', 'MATIC', 'AVAX', 'ARB', 'OP', 'BASE'],
          description: 'List of production-supported cryptocurrencies for deposits/withdrawals',
        },
        {
          key: 'market_filters',
          value: [
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
          ],
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
        // Get specific config by key
        const { data, error } = await supabase
          .from('app_config')
          .select('*')
          .eq('key', key)
          .single();

        if (error) {
          if (error.code === 'PGRST116') {
            return res.status(404).json({ error: `Config key "${key}" not found` });
          }
          throw error;
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
      // Admin-only: set/update config
      const { key, value, description } = req.body;

      if (!key || !value) {
        return res.status(400).json({ error: 'Missing required fields: key, value' });
      }

      const { data, error } = await supabase
        .from('app_config')
        .upsert({
          key,
          value,
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

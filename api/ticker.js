import supabase from './db-client.js';

const NAMES = ['M. Hale', 'E. Voss', 'K. Nakamura', 'S. Alvarez', 'J. Okafor', 'P. Mehta', 'L. Bianchi', 'A. Dubois', 'R. Chen', 'N. Patel', 'C. Rossi', 'H. Kim'];
const SIDES = ['BUY', 'SELL'];

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(204).end();

  try {
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

    const { data: markets, error: mErr } = await supabase
      .from('markets')
      .select('symbol,price,asset_class')
      .limit(250);
    if (mErr) throw mErr;

    if (markets && markets.length) {
      const m = markets[Math.floor(Math.random() * markets.length)];
      const side = SIDES[Math.floor(Math.random() * 2)];
      const qty = m.asset_class === 'crypto'
        ? Number((Math.random() * 2 + 0.01).toFixed(4))
        : m.asset_class === 'forex'
          ? Number((Math.random() * 80000 + 1000).toFixed(0))
          : Number((Math.random() * 400 + 5).toFixed(2));
      const drift = 1 + (Math.random() - 0.5) * 0.002;
      await supabase.from('ticker_trades').insert({
        trader_name: NAMES[Math.floor(Math.random() * NAMES.length)],
        symbol: m.symbol,
        side,
        quantity: qty,
        price: Number((Number(m.price) * drift).toFixed(6)),
        asset_class: m.asset_class,
      });
    }

    const { data, error } = await supabase
      .from('ticker_trades')
      .select('*')
      .order('id', { ascending: false })
      .limit(40);
    if (error) throw error;
    return res.status(200).json(data || []);
  } catch (err) {
    console.error('API error:', err);
    res.status(500).json({ error: err.message });
  }
}

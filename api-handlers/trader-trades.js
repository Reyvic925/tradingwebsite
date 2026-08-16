import supabase from './db-client.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(204).end();

  try {
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

    const { traderId } = req.query;
    if (!traderId) return res.status(400).json({ error: 'Trader ID required' });

    // Get last 50 trades for this trader
    const { data, error } = await supabase
      .from('trade_logs')
      .select('*')
      .eq('trader_id', Number(traderId))
      .order('traded_at', { ascending: false })
      .limit(50);

    if (error) throw error;

    return res.status(200).json(data || []);
  } catch (err) {
    console.error('API error:', err);
    res.status(500).json({ error: err.message });
  }
}

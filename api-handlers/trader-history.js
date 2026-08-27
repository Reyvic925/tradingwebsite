import supabase from './db-client.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const { traderId } = req.query;
  if (!traderId || !/^\d+$/.test(String(traderId))) {
    return res.status(400).json({ error: 'Trader ID must be an integer' });
  }

  try {
    const { data, error } = await supabase
      .from('trader_history')
      .select('snapshot_date, equity, daily_return')
      .eq('trader_id', traderId)
      .order('snapshot_date', { ascending: true });
    if (error) throw error;
    return res.status(200).json(data || []);
  } catch (error) {
    console.error('API error:', error);
    return res.status(500).json({ error: error.message });
  }
}

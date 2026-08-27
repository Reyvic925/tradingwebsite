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
    if (!/^\d+$/.test(String(traderId))) {
      return res.status(400).json({ error: 'Trader ID must be an integer' });
    }

    // Show the 25 largest wins and 25 largest losses, rather than an arbitrary
    // recent slice that can hide the trader's actual risk and performance.
    const [winsResult, lossesResult] = await Promise.all([
      supabase
        .from('trade_logs')
        .select('*')
        .eq('trader_id', traderId)
        .gt('pnl', 0)
        .order('pnl', { ascending: false })
        .limit(25),
      supabase
        .from('trade_logs')
        .select('*')
        .eq('trader_id', traderId)
        .lt('pnl', 0)
        .order('pnl', { ascending: true })
        .limit(25),
    ]);

    if (winsResult.error) throw winsResult.error;
    if (lossesResult.error) throw lossesResult.error;

    const wins = winsResult.data || [];
    const losses = lossesResult.data || [];
    return res.status(200).json([...wins, ...losses]);
  } catch (err) {
    console.error('API error:', err);
    res.status(500).json({ error: err.message });
  }
}

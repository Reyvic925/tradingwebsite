import supabase from './db-client.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  if (req.method === 'OPTIONS') return res.status(204).end();

  try {
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

    // Read the source table directly so admin visibility changes are reflected
    // immediately, even if the leaderboard view is stale or missing.
    const { data, error } = await supabase
      .from('traders')
      .select('*')
      .eq('is_active', true)
      .order('total_return', { ascending: false })
      .limit(100);

    if (error) throw error;

    // Add rankings and medals after filtering to active traders.
    const leaderboard = (data || []).map((trader, index) => ({
      ...trader,
      total_return: Math.max(Number(trader.total_return) || 0, 0),
      monthly_return: Math.max(Number(trader.monthly_return) || 0, 0),
      rank: index + 1,
      medal: index === 0 ? 'gold' : index === 1 ? 'silver' : index === 2 ? 'bronze' : null,
      medalIcon: index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : null
    }));

    return res.status(200).json(leaderboard);
  } catch (err) {
    console.error('API error:', err);
    res.status(500).json({ error: err.message });
  }
}

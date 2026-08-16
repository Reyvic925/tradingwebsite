import supabase from './db-client.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(204).end();

  try {
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

    // Get top traders with rankings
    const { data, error } = await supabase
      .from('leaderboard_view')
      .select('*')
      .limit(100);

    if (error) throw error;

    // Add medal icons and rank
    const leaderboard = (data || []).map((trader, index) => ({
      ...trader,
      rank: index + 1,
      medal: trader.medal || null,
      medalIcon: trader.medal === 'gold' ? '🥇' : trader.medal === 'silver' ? '🥈' : trader.medal === 'bronze' ? '🥉' : null
    }));

    return res.status(200).json(leaderboard);
  } catch (err) {
    console.error('API error:', err);
    res.status(500).json({ error: err.message });
  }
}

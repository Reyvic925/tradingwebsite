import supabase from './db-client.js';
import { validateTraderRecord, filterVisibleTraders } from './trader-validation.js';

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
    const activeTraders = filterVisibleTraders((data || []).map((trader) => {
      try {
        return validateTraderRecord(trader);
      } catch (error) {
        console.error(`[leaderboard] Rejected invalid trader ${trader?.id ?? 'unknown'}: ${error.message}`);
        return null;
      }
    }).filter(Boolean));
    const leaderboard = activeTraders.map((trader, index) => ({
      ...trader,
      total_return: Number(trader.total_return),
      monthly_return: Number(trader.monthly_return),
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

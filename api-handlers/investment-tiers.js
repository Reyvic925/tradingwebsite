import supabase from './db-client.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(204).end();

  try {
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

    // GET all investment tiers
    const { data, error } = await supabase
      .from('investment_tiers')
      .select('*')
      .eq('simulation_enabled', true)
      .order('tier_level', { ascending: true });

    if (error) throw error;
    return res.status(200).json(data || []);
  } catch (err) {
    console.error('[investment-tiers] error', err);
    return res.status(500).json({ error: String(err?.message || err) });
  }
}

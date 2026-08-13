import supabase from './db-client.js';
import { INDEX_SEED } from './intl-universe.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(204).end();

  try {
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

    const { data: existing } = await supabase.from('market_indices').select('*').order('id', { ascending: true });
    if (!existing?.length) {
      await supabase.from('market_indices').insert(INDEX_SEED);
      const { data } = await supabase.from('market_indices').select('*').order('id', { ascending: true });
      return res.status(200).json(data || INDEX_SEED);
    }
    return res.status(200).json(existing);
  } catch (err) {
    console.error('API error:', err);
    res.status(200).json(INDEX_SEED);
  }
}

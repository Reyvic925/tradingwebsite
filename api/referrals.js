import supabase from './db-client.js';
import { getProfileRow } from './helpers.js';

async function requireUser(req) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return null;
  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) return null;
  return user;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(204).end();

  try {
    const user = await requireUser(req);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

    const profile = await getProfileRow(supabase, user.id);
    const { data: list, error } = await supabase
      .from('referrals')
      .select('*')
      .eq('referrer_id', user.id)
      .order('id', { ascending: false });
    if (error) throw error;
    const total = (list || []).reduce((s, r) => s + Number(r.bonus || 0), 0);
    return res.status(200).json({
      code: profile?.referral_code || '',
      referrals: list || [],
      total_bonus: total,
      count: (list || []).length,
    });
  } catch (err) {
    console.error('API error:', err);
    res.status(500).json({ error: err.message });
  }
}

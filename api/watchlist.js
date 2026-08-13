import supabase from './db-client.js';

async function requireUser(req) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return null;
  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) return null;
  return user;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(204).end();

  try {
    const user = await requireUser(req);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    if (req.method === 'GET') {
      const { data, error } = await supabase
        .from('watchlist')
        .select('*')
        .eq('user_id', user.id)
        .order('id', { ascending: true });
      if (error) throw error;
      return res.status(200).json(data || []);
    }

    if (req.method === 'POST') {
      const { market_id, symbol } = req.body || {};
      if (!market_id) return res.status(400).json({ error: 'Missing market_id' });
      const { data: existingRows } = await supabase
        .from('watchlist')
        .select('*')
        .eq('user_id', user.id)
        .eq('market_id', market_id)
        .limit(1);
      if (existingRows?.[0]) return res.status(200).json(existingRows[0]);
      const { data, error } = await supabase
        .from('watchlist')
        .insert({ user_id: user.id, market_id, symbol: symbol || '' })
        .select();
      if (error) throw error;
      return res.status(201).json(data?.[0] || { ok: true });
    }

    if (req.method === 'DELETE') {
      const { id, market_id } = req.body || {};
      let q = supabase.from('watchlist').delete().eq('user_id', user.id);
      if (id) q = q.eq('id', id);
      else if (market_id) q = q.eq('market_id', market_id);
      else return res.status(400).json({ error: 'Missing id' });
      const { error } = await q;
      if (error) throw error;
      return res.status(200).json({ ok: true });
    }

    res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('API error:', err);
    res.status(500).json({ error: err.message });
  }
}

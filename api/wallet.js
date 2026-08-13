import supabase from './db-client.js';
import { getOrCreateWallet } from './helpers.js';

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

    const wallet = await getOrCreateWallet(supabase, user.id);

    const { data: positions } = await supabase
      .from('positions')
      .select('*')
      .eq('user_id', user.id)
      .eq('status', 'open');

    const unrealized = (positions || []).reduce((s, p) => s + Number(p.pnl || 0), 0);
    const equity = Number(wallet.available) + Number(wallet.reserved) + unrealized;

    return res.status(200).json({ ...wallet, unrealized, equity, open_positions: (positions || []).length });
  } catch (err) {
    console.error('API error:', err);
    res.status(500).json({ error: err.message });
  }
}

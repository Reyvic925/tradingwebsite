import supabase from './db-client.js';
import { getUsdWallet, first, findById, requireUser as authUser } from './helpers.js';

async function requireUser(req) {
  return authUser(supabase, req);
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
        .from('copy_trades')
        .select('*')
        .eq('user_id', user.id)
        .order('id', { ascending: false });
      if (error) throw error;
      return res.status(200).json(data || []);
    }

    if (req.method === 'POST') {
      const { trader_id, allocated } = req.body || {};
      const amt = Number(allocated);
      if (!trader_id || !(amt > 0)) return res.status(400).json({ error: 'Invalid allocation' });
      if (amt < 50) return res.status(400).json({ error: 'Minimum allocation is $50' });

      const trader = await findById(supabase, 'traders', trader_id);
      if (!trader) return res.status(400).json({ error: 'Trader not found' });

      const wallet = await getUsdWallet(supabase, user.id);
      if (!wallet || Number(wallet.available) < amt) return res.status(400).json({ error: 'Insufficient balance' });

      await supabase.from('wallets').update({
        available: Number(wallet.available) - amt,
        reserved: Number(wallet.reserved) + amt,
      }).eq('id', wallet.id);

      const { data, error } = await supabase
        .from('copy_trades')
        .insert({
          user_id: user.id,
          trader_id,
          trader_name: trader.name,
          allocated: amt,
          pnl: 0,
          status: 'active',
        })
        .select();
      if (error) throw error;

      await supabase.from('traders').update({ followers: Number(trader.followers) + 1 }).eq('id', trader.id);
      await supabase.from('notifications').insert({
        user_id: user.id,
        title: `Copying ${trader.name}`,
        body: `$${amt.toFixed(2)} allocated to this strategy.`,
        read: false,
      });
      return res.status(201).json(first(data));
    }

    if (req.method === 'DELETE') {
      const { id } = req.body || {};
      if (!id) return res.status(400).json({ error: 'Missing id' });
      const { data: ctRows } = await supabase.from('copy_trades').select('*').eq('id', id).eq('user_id', user.id).limit(1);
      const ct = first(ctRows);
      if (!ct || ct.status !== 'active') return res.status(404).json({ error: 'Active copy trade not found' });

      const wallet = await getUsdWallet(supabase, user.id);
      if (wallet) {
        await supabase.from('wallets').update({
          available: Number(wallet.available) + Number(ct.allocated) + Number(ct.pnl || 0),
          reserved: Math.max(0, Number(wallet.reserved) - Number(ct.allocated)),
        }).eq('id', wallet.id);
      }
      await supabase.from('copy_trades').update({ status: 'stopped' }).eq('id', id);
      return res.status(200).json({ ok: true });
    }

    res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('API error:', err);
    res.status(500).json({ error: err.message });
  }
}

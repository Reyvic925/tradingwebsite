import supabase from './db-client.js';
import { getUsdWallet, first, findById, requireUser as authUser } from './helpers.js';

async function requireUser(req) {
  return authUser(supabase, req);
}

async function markToMarket(userId) {
  const { data: positions } = await supabase
    .from('positions')
    .select('*')
    .eq('user_id', userId)
    .eq('status', 'open');
  if (!positions?.length) return [];

  const { data: markets } = await supabase.from('markets').select('*');
  const byId = Object.fromEntries((markets || []).map((m) => [m.id, m]));

  const updated = [];
  for (const pos of positions) {
    const m = byId[pos.market_id];
    const price = m ? Number(m.price) : Number(pos.current_price);
    const dir = pos.side === 'long' || pos.side === 'buy' ? 1 : -1;
    const pnl = (price - Number(pos.entry_price)) * Number(pos.quantity) * dir;

    const sl = pos.stop_loss != null ? Number(pos.stop_loss) : null;
    const tp = pos.take_profit != null ? Number(pos.take_profit) : null;
    const hitSL = sl != null && (dir === 1 ? price <= sl : price >= sl);
    const hitTP = tp != null && (dir === 1 ? price >= tp : price <= tp);

    if (hitSL || hitTP) {
      const wallet = await getUsdWallet(supabase, userId);
      if (wallet) {
        await supabase
          .from('wallets')
          .update({
            available: Number(wallet.available) + Number(pos.margin) + pnl,
            reserved: Math.max(0, Number(wallet.reserved) - Number(pos.margin)),
          })
          .eq('id', wallet.id);
      }
      const reason = hitSL ? 'stop-loss' : 'take-profit';
      await supabase
        .from('positions')
        .update({
          status: 'closed',
          current_price: price,
          pnl,
          closed_at: new Date().toISOString(),
        })
        .eq('id', pos.id);
      await supabase.from('notifications').insert({
        user_id: userId,
        title: `${reason === 'stop-loss' ? 'Stop-loss' : 'Take-profit'} hit on ${pos.symbol}`,
        body: `Position closed at ${price}. P&L ${pnl >= 0 ? '+' : ''}${pnl.toFixed(2)} USD`,
        read: false,
      });
    } else {
      const { data: row } = await supabase
        .from('positions')
        .update({ current_price: price, pnl })
        .eq('id', pos.id)
        .select();
      updated.push(first(row) || { ...pos, current_price: price, pnl });
    }
  }
  return updated;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(204).end();

  try {
    const user = await requireUser(req);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    if (req.method === 'GET') {
      await markToMarket(user.id);
      const status = req.query.status || 'open';
      let q = supabase.from('positions').select('*').eq('user_id', user.id).order('id', { ascending: false });
      if (status !== 'all') q = q.eq('status', status);
      const { data, error } = await q;
      if (error) throw error;
      return res.status(200).json(data || []);
    }

    if (req.method === 'PUT') {
      const { id, stop_loss, take_profit } = req.body || {};
      if (!id) return res.status(400).json({ error: 'Missing id' });
      const { data, error } = await supabase
        .from('positions')
        .update({
          stop_loss: stop_loss === '' || stop_loss == null ? null : Number(stop_loss),
          take_profit: take_profit === '' || take_profit == null ? null : Number(take_profit),
        })
        .eq('id', id)
        .eq('user_id', user.id)
        .select();
      if (error) throw error;
      return res.status(200).json(first(data));
    }

    if (req.method === 'DELETE') {
      const { id } = req.body || {};
      if (!id) return res.status(400).json({ error: 'Missing id' });
      const { data: posRows } = await supabase
        .from('positions')
        .select('*')
        .eq('id', id)
        .eq('user_id', user.id)
        .limit(1);
      const pos = first(posRows);
      if (!pos || pos.status !== 'open') return res.status(404).json({ error: 'Open position not found' });

      const market = await findById(supabase, 'markets', pos.market_id);
      const price = market ? Number(market.price) : Number(pos.current_price);
      const dir = pos.side === 'long' || pos.side === 'buy' ? 1 : -1;
      const pnl = (price - Number(pos.entry_price)) * Number(pos.quantity) * dir;

      const wallet = await getUsdWallet(supabase, user.id);
      if (wallet) {
        await supabase
          .from('wallets')
          .update({
            available: Number(wallet.available) + Number(pos.margin) + pnl,
            reserved: Math.max(0, Number(wallet.reserved) - Number(pos.margin)),
          })
          .eq('id', wallet.id);
      }

      const { data, error } = await supabase
        .from('positions')
        .update({ status: 'closed', current_price: price, pnl, closed_at: new Date().toISOString() })
        .eq('id', id)
        .select();
      if (error) throw error;

      await supabase.from('orders').insert({
        user_id: user.id,
        market_id: pos.market_id,
        symbol: pos.symbol,
        side: dir === 1 ? 'sell' : 'buy',
        type: 'market',
        quantity: pos.quantity,
        price,
        status: 'filled',
        filled_price: price,
      });

      await supabase.from('notifications').insert({
        user_id: user.id,
        title: `Closed ${pos.symbol}`,
        body: `Realized P&L ${pnl >= 0 ? '+' : ''}${pnl.toFixed(2)} USD at ${price}`,
        read: false,
      });

      return res.status(200).json(first(data));
    }

    res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('API error:', err);
    res.status(500).json({ error: err.message });
  }
}

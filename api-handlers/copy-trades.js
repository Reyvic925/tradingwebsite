import supabase from './db-client.js';
import { getUsdWallet, first, findById, requireUser as authUser } from './helpers.js';

async function requireUser(req) {
  return authUser(supabase, req);
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(204).end();

  try {
    const user = await requireUser(req);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    // GET: Fetch user's follows with trader info
    if (req.method === 'GET') {
      const { data, error } = await supabase
        .from('user_follows')
        .select(`
          *,
          trader:traders(*)
        `)
        .eq('user_id', user.id)
        .eq('is_copying', true)
        .order('followed_at', { ascending: false });
      
      if (error) throw error;
      return res.status(200).json(data || []);
    }

    // POST: Create new follow/copy
    if (req.method === 'POST') {
      const {
        trader_id,
        allocated_amount,
        stop_loss_percent,
        take_profit_percent,
        leverage_multiplier
      } = req.body || {};

      if (!trader_id || !(allocated_amount > 0)) {
        return res.status(400).json({ error: 'Invalid trader_id or amount' });
      }

      if (allocated_amount < 100) {
        return res.status(400).json({ error: 'Minimum allocation is $100' });
      }

      // Check if trader exists
      const trader = await findById(supabase, 'traders', trader_id);
      if (!trader) return res.status(400).json({ error: 'Trader not found' });

      // Check wallet balance
      const wallet = await getUsdWallet(supabase, user.id);
      if (!wallet || Number(wallet.available) < allocated_amount) {
        return res.status(400).json({ error: 'Insufficient balance' });
      }

      // Check if already following
      const { data: existingFollow } = await supabase
        .from('user_follows')
        .select('id')
        .eq('user_id', user.id)
        .eq('trader_id', trader_id)
        .limit(1);

      if (existingFollow && existingFollow.length > 0) {
        return res.status(400).json({ error: 'Already following this trader' });
      }

      // Reserve funds
      await supabase.from('wallets').update({
        available: Number(wallet.available) - allocated_amount,
        reserved: Number(wallet.reserved) + allocated_amount,
      }).eq('id', wallet.id);

      // Create user_follow entry
      const { data, error } = await supabase
        .from('user_follows')
        .insert({
          user_id: user.id,
          trader_id,
          allocated_amount,
          current_value: allocated_amount,
          pnl: 0,
          pnl_percent: 0,
          stop_loss_percent: stop_loss_percent || 20,
          take_profit_percent: take_profit_percent || 200,
          leverage_multiplier: leverage_multiplier || 1,
          is_copying: true
        })
        .select();

      if (error) throw error;

      // Update trader followers count
      await supabase
        .from('traders')
        .update({ followers: Number(trader.followers || 0) + 1 })
        .eq('id', trader_id);

      // Create notification
      await supabase.from('notifications').insert({
        user_id: user.id,
        trader_id,
        title: `Now copying ${trader.name}`,
        message: `$${allocated_amount.toFixed(2)} allocated to copy this trader's positions.`,
        type: 'info',
        read: false
      });

      return res.status(201).json(first(data));
    }

    // PUT: Update follow settings (risk management)
    if (req.method === 'PUT') {
      const { id } = req.query;
      if (!id) return res.status(400).json({ error: 'Follow ID required' });

      const {
        stop_loss_percent,
        take_profit_percent,
        leverage_multiplier
      } = req.body || {};

      const updateData = {};
      if (stop_loss_percent !== undefined) updateData.stop_loss_percent = stop_loss_percent;
      if (take_profit_percent !== undefined) updateData.take_profit_percent = take_profit_percent;
      if (leverage_multiplier !== undefined) updateData.leverage_multiplier = leverage_multiplier;

      if (Object.keys(updateData).length === 0) {
        return res.status(400).json({ error: 'No fields to update' });
      }

      const { data, error } = await supabase
        .from('user_follows')
        .update({ ...updateData, updated_at: new Date() })
        .eq('id', id)
        .eq('user_id', user.id)
        .select();

      if (error) throw error;
      if (!data || data.length === 0) {
        return res.status(404).json({ error: 'Follow not found' });
      }

      return res.status(200).json(first(data));
    }

    // DELETE: Stop copying
    if (req.method === 'DELETE') {
      const { id } = req.query;
      if (!id) return res.status(400).json({ error: 'Follow ID required' });

      // Get the follow record
      const { data: followData } = await supabase
        .from('user_follows')
        .select('*')
        .eq('id', id)
        .eq('user_id', user.id)
        .limit(1);

      const follow = first(followData);
      if (!follow) return res.status(404).json({ error: 'Follow not found' });

      // Return funds to wallet
      const wallet = await getUsdWallet(supabase, user.id);
      if (wallet) {
        const returnAmount = Number(follow.current_value) || Number(follow.allocated_amount);
        await supabase.from('wallets').update({
          available: Number(wallet.available) + returnAmount,
          reserved: Math.max(0, Number(wallet.reserved) - Number(follow.allocated_amount)),
        }).eq('id', wallet.id);
      }

      // Mark as not copying
      const { error } = await supabase
        .from('user_follows')
        .update({ is_copying: false, updated_at: new Date() })
        .eq('id', id);

      if (error) throw error;

      // Create notification
      const { data: traderData } = await supabase
        .from('traders')
        .select('name')
        .eq('id', follow.trader_id)
        .limit(1);

      const trader = first(traderData);
      if (trader) {
        await supabase.from('notifications').insert({
          user_id: user.id,
          trader_id: follow.trader_id,
          title: `Stopped copying ${trader.name}`,
          message: `Final PnL: ${follow.pnl_percent >= 0 ? '+' : ''}${follow.pnl_percent.toFixed(2)}%`,
          type: follow.pnl_percent >= 0 ? 'success' : 'error',
          read: false
        });
      }

      return res.status(200).json({ ok: true });
    }

    res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('API error:', err);
    res.status(500).json({ error: err.message });
  }
}

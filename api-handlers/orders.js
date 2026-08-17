import supabase from './db-client.js';
import { createNotification } from './notification-service.js';
import { getUsdWallet, firstOpenPosition, first, findById, requireUser as authUser } from './helpers.js';

async function requireUser(req) {
  return authUser(supabase, req);
}

const MARGIN_RATE = 0.1;

function orderSideOf(positionSide) {
  return positionSide === 'long' || positionSide === 'buy' ? 'buy' : 'sell';
}

async function applyPnl(userId, pnl, releaseMargin) {
  const wallet = await getUsdWallet(supabase, userId);
  if (!wallet) throw new Error('Wallet not found');
  const available = Number(wallet.available) + Number(releaseMargin) + Number(pnl);
  const reserved = Math.max(0, Number(wallet.reserved) - Number(releaseMargin));
  await supabase.from('wallets').update({ available, reserved }).eq('id', wallet.id);
  return { available, reserved };
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
        .from('orders')
        .select('*')
        .eq('user_id', user.id)
        .order('id', { ascending: false })
        .limit(100);
      if (error) throw error;
      return res.status(200).json(data || []);
    }

    if (req.method === 'POST') {
      const { market_id, side, type, quantity, price, stop_loss, take_profit } = req.body || {};
      if (!market_id || !side || !quantity) return res.status(400).json({ error: 'Missing order fields' });
      const qty = Number(quantity);
      if (!(qty > 0)) return res.status(400).json({ error: 'Quantity must be positive' });
      if (!['buy', 'sell'].includes(side)) return res.status(400).json({ error: 'Invalid side' });

      const market = await findById(supabase, 'markets', market_id);
      if (!market) return res.status(400).json({ error: 'Unknown market' });

      const orderType = type === 'limit' ? 'limit' : 'market';
      const fillPrice = orderType === 'limit' && price ? Number(price) : Number(market.price);
      const notional = qty * fillPrice;
      const margin = notional * MARGIN_RATE;

      if (orderType === 'limit') {
        const { data: order, error } = await supabase
          .from('orders')
          .insert({
            user_id: user.id,
            market_id,
            symbol: market.symbol,
            side,
            type: 'limit',
            quantity: qty,
            price: fillPrice,
            stop_loss: stop_loss || null,
            take_profit: take_profit || null,
            status: 'pending',
            filled_price: null,
          })
          .select();
        if (error) throw error;
        return res.status(201).json(first(order));
      }

      const wallet = await getUsdWallet(supabase, user.id);
      if (!wallet) return res.status(400).json({ error: 'Wallet not found' });
      if (Number(wallet.available) < margin) {
        return res.status(400).json({ error: `Insufficient margin. Required ${margin.toFixed(2)} USD` });
      }

      await supabase
        .from('wallets')
        .update({
          available: Number(wallet.available) - margin,
          reserved: Number(wallet.reserved) + margin,
        })
        .eq('id', wallet.id);

      const { data: order, error: oErr } = await supabase
        .from('orders')
        .insert({
          user_id: user.id,
          market_id,
          symbol: market.symbol,
          side,
          type: 'market',
          quantity: qty,
          price: fillPrice,
          stop_loss: stop_loss || null,
          take_profit: take_profit || null,
          status: 'filled',
          filled_price: fillPrice,
        })
        .select();
      if (oErr) throw oErr;
      const filledOrder = first(order);

      const existing = await firstOpenPosition(supabase, user.id, market_id);

      if (existing && orderSideOf(existing.side) === side) {
        const newQty = Number(existing.quantity) + qty;
        const newEntry = (Number(existing.entry_price) * Number(existing.quantity) + fillPrice * qty) / newQty;
        const { data: pos, error: pErr } = await supabase
          .from('positions')
          .update({
            quantity: newQty,
            entry_price: newEntry,
            current_price: fillPrice,
            margin: Number(existing.margin) + margin,
            stop_loss: stop_loss || existing.stop_loss,
            take_profit: take_profit || existing.take_profit,
          })
          .eq('id', existing.id)
          .select();
        if (pErr) throw pErr;
        await createNotification(supabase, {
          user_id: user.id,
          title: `Filled ${side.toUpperCase()} ${market.symbol}`,
          body: `${qty} @ ${fillPrice} — position increased`,
          read: false,
        });
        return res.status(201).json({ order: filledOrder, position: first(pos) });
      }

      if (existing && orderSideOf(existing.side) !== side) {
        const closeQty = Math.min(Number(existing.quantity), qty);
        const dir = existing.side === 'long' || existing.side === 'buy' ? 1 : -1;
        const pnl = (fillPrice - Number(existing.entry_price)) * closeQty * dir;
        const released = (Number(existing.margin) * closeQty) / Number(existing.quantity);
        await applyPnl(user.id, pnl, released);

        if (closeQty >= Number(existing.quantity)) {
          await supabase
            .from('positions')
            .update({ status: 'closed', current_price: fillPrice, pnl, closed_at: new Date().toISOString() })
            .eq('id', existing.id);
        } else {
          await supabase
            .from('positions')
            .update({
              quantity: Number(existing.quantity) - closeQty,
              margin: Number(existing.margin) - released,
              current_price: fillPrice,
            })
            .eq('id', existing.id);
        }

        const remainder = qty - closeQty;
        let newPos = null;
        if (remainder > 0) {
          const remMargin = (remainder / qty) * margin;
          const { data: created } = await supabase
            .from('positions')
            .insert({
              user_id: user.id,
              market_id,
              symbol: market.symbol,
              side: side === 'buy' ? 'long' : 'short',
              quantity: remainder,
              entry_price: fillPrice,
              current_price: fillPrice,
              stop_loss: stop_loss || null,
              take_profit: take_profit || null,
              pnl: 0,
              margin: remMargin,
              status: 'open',
            })
            .select();
          newPos = first(created);
        }

        await createNotification(supabase, {
          user_id: user.id,
          title: `Closed ${existing.side} ${market.symbol}`,
          body: `Realized P&L ${pnl >= 0 ? '+' : ''}${pnl.toFixed(2)} USD`,
          read: false,
        });
        return res.status(201).json({ order: filledOrder, realized_pnl: pnl, position: newPos });
      }

      const { data: pos, error: pErr } = await supabase
        .from('positions')
        .insert({
          user_id: user.id,
          market_id,
          symbol: market.symbol,
          side: side === 'buy' ? 'long' : 'short',
          quantity: qty,
          entry_price: fillPrice,
          current_price: fillPrice,
          stop_loss: stop_loss || null,
          take_profit: take_profit || null,
          pnl: 0,
          margin,
          status: 'open',
        })
        .select();
      if (pErr) throw pErr;

      await createNotification(supabase, {
        user_id: user.id,
        title: `Opened ${side === 'buy' ? 'LONG' : 'SHORT'} ${market.symbol}`,
        body: `${qty} @ ${fillPrice} · margin ${margin.toFixed(2)} USD`,
        read: false,
      });

      return res.status(201).json({ order: filledOrder, position: first(pos) });
    }

    if (req.method === 'DELETE') {
      const { id } = req.body || {};
      if (!id) return res.status(400).json({ error: 'Missing id' });
      const { data: orderRows } = await supabase.from('orders').select('*').eq('id', id).eq('user_id', user.id).limit(1);
      const order = first(orderRows);
      if (!order) return res.status(404).json({ error: 'Order not found' });
      if (order.status !== 'pending') return res.status(400).json({ error: 'Only pending orders can be cancelled' });
      const { error } = await supabase.from('orders').update({ status: 'cancelled' }).eq('id', id);
      if (error) throw error;
      return res.status(200).json({ ok: true });
    }

    res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('API error:', err);
    res.status(500).json({ error: err.message });
  }
}

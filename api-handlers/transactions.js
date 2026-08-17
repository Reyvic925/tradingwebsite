import supabase from './db-client.js';
import { createNotification } from './notification-service.js';
import { getUsdWallet, first, requireUser as authUser } from './helpers.js';

async function requireUser(req) {
  return authUser(supabase, req);
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(204).end();

  try {
    const user = await requireUser(req);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    if (req.method === 'GET') {
      const { data, error } = await supabase
        .from('transactions')
        .select('*')
        .eq('user_id', user.id)
        .order('id', { ascending: false })
        .limit(200);
      if (error) throw error;
      return res.status(200).json(data || []);
    }

    if (req.method === 'POST') {
      const { type, amount, method } = req.body || {};
      const amt = Number(amount);
      if (!['deposit', 'withdrawal'].includes(type)) return res.status(400).json({ error: 'Invalid type' });
      if (!(amt > 0)) return res.status(400).json({ error: 'Amount must be positive' });
      if (type === 'deposit' && amt < 10) return res.status(400).json({ error: 'Minimum deposit is $10' });
      if (type === 'withdrawal' && amt < 20) return res.status(400).json({ error: 'Minimum withdrawal is $20' });

      const wallet = await getUsdWallet(supabase, user.id);
      if (!wallet) return res.status(400).json({ error: 'Wallet not found' });

      if (type === 'withdrawal' && Number(wallet.available) < amt) {
        return res.status(400).json({ error: 'Insufficient available balance' });
      }

      if (type === 'deposit') {
        await supabase.from('wallets').update({ available: Number(wallet.available) + amt }).eq('id', wallet.id);
      } else {
        await supabase.from('wallets').update({ available: Number(wallet.available) - amt }).eq('id', wallet.id);
      }

      const ref = `${type === 'deposit' ? 'DEP' : 'WDR'}-${Date.now().toString(36).toUpperCase()}`;
      const { data, error } = await supabase
        .from('transactions')
        .insert({
          user_id: user.id,
          type,
          amount: amt,
          currency: 'USD',
          method: method || (type === 'deposit' ? 'card' : 'bank'),
          status: 'completed',
          reference: ref,
        })
        .select();
      if (error) throw error;

      await createNotification(supabase, {
        user_id: user.id,
        title: type === 'deposit' ? 'Deposit credited' : 'Withdrawal sent',
        body: `${type === 'deposit' ? '+' : '-'}$${amt.toFixed(2)} via ${method || 'transfer'} · ${ref}`,
        read: false,
      });

      return res.status(201).json(first(data));
    }

    res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('API error:', err);
    res.status(500).json({ error: err.message });
  }
}

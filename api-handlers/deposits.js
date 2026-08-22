/**
 * Deposits Handler
 * 
 * Handles deposit creation and admin confirmation
 * POST /api/deposits - Create a deposit request
 * GET /api/deposits/history - Get user's deposit history
 * POST /api/deposits/confirm - Admin confirms a deposit
 */

import supabase from './db-client.js';
import { first, requireUser } from './helpers.js';
import { requireAdmin } from './auth-admin.js';
import { creditReferralDeposit } from './referral-rewards.js';

async function getUserDeposits(userId) {
  const { data, error } = await supabase
    .from('deposits')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data || [];
}

async function getDepositById(depositId) {
  const { data, error } = await supabase
    .from('deposits')
    .select('*')
    .eq('id', depositId)
    .limit(1);

  if (error) throw error;
  return first(data);
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(204).end();

  try {
    const url = new URL(req.url, `http://localhost`);
    const parts = url.pathname.split('/').filter(Boolean);

    // POST /api/deposits - Create deposit request
    if (req.method === 'POST' && parts[1] === 'deposits' && !parts[2]) {
      const user = await requireUser(supabase, req);
      if (!user) return res.status(401).json({ error: 'Unauthorized' });

      const { amount, currency = 'USD', method = 'manual' } = req.body || {};

      if (!amount || amount < 0) {
        return res.status(400).json({ error: 'amount is required and must be positive' });
      }

      const { data, error } = await supabase
        .from('deposits')
        .insert({
          user_id: user.id,
          amount,
          currency,
          method,
          status: 'pending',
        })
        .select();

      if (error) {
        console.error('[deposits] Failed to create deposit:', error.message);
        return res.status(500).json({ error: 'Internal error' });
      }

      return res.status(201).json({ deposit: first(data) });
    }

    // GET /api/deposits/history - Get user's deposits
    if (req.method === 'GET' && parts[1] === 'deposits' && parts[2] === 'history') {
      const user = await requireUser(supabase, req);
      if (!user) return res.status(401).json({ error: 'Unauthorized' });

      const deposits = await getUserDeposits(user.id);
      return res.status(200).json({ deposits });
    }

    // POST /api/deposits/confirm - Admin confirms deposit
    if (req.method === 'POST' && parts[1] === 'deposits' && parts[2] === 'confirm') {
      const admin = await requireAdmin(req);
      if (!admin) return res.status(401).json({ error: 'Unauthorized' });

      const { depositId } = req.body || {};
      if (!depositId) {
        return res.status(400).json({ error: 'depositId is required' });
      }

      const deposit = await getDepositById(depositId);
      if (!deposit) return res.status(404).json({ error: 'Deposit not found' });

      if (deposit.status !== 'pending') {
        return res.status(400).json({ error: `Cannot confirm deposit with status: ${deposit.status}` });
      }

      // Update deposit status to confirmed
      const { data: updated, error: updateErr } = await supabase
        .from('deposits')
        .update({
          status: 'confirmed',
          confirmed_at: new Date().toISOString(),
          admin_notes: req.body?.admin_notes || '',
        })
        .eq('id', depositId)
        .select();

      if (updateErr) {
        console.error('[deposits] Failed to confirm deposit:', updateErr.message);
        return res.status(500).json({ error: 'Internal error' });
      }

      // Credit user's available balance
      const { data: wallets } = await supabase
        .from('wallets')
        .select('*')
        .eq('user_id', deposit.user_id)
        .eq('currency', deposit.currency)
        .limit(1);

      const wallet = first(wallets);
      if (wallet) {
        await supabase
          .from('wallets')
          .update({ available: Number(wallet.available) + Number(deposit.amount) })
          .eq('id', wallet.id);
      } else {
        // Create wallet if it doesn't exist
        await supabase
          .from('wallets')
          .insert({
            user_id: deposit.user_id,
            currency: deposit.currency,
            available: Number(deposit.amount),
            reserved: 0,
          });
      }

      await creditReferralDeposit(supabase, { ...deposit, amount: Number(deposit.amount) });

      return res.status(200).json({ deposit: first(updated) });
    }

    return res.status(404).json({ error: 'Not found' });
  } catch (err) {
    console.error('[deposits] Error:', err.message);
    res.status(500).json({ error: err.message });
  }
}

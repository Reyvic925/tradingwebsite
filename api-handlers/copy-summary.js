import supabase from './db-client.js';
import { requireUser as authUser } from './helpers.js';

async function requireUser(req) {
  return authUser(supabase, req);
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

    // Get all active follows for the user
    const { data: follows, error } = await supabase
      .from('user_follows')
      .select('*')
      .eq('user_id', user.id)
      .eq('is_copying', true);

    if (error) throw error;

    // Calculate summary
    const summary = {
      total_invested: 0,
      total_current: 0,
      total_pnl: 0,
      total_pnl_percent: 0,
      count: (follows || []).length,
      details: []
    };

    (follows || []).forEach(follow => {
      summary.total_invested += Number(follow.allocated_amount) || 0;
      summary.total_current += Number(follow.current_value) || 0;
      summary.total_pnl += Number(follow.pnl) || 0;
      summary.details.push({
        id: follow.id,
        trader_id: follow.trader_id,
        allocated: Number(follow.allocated_amount),
        current: Number(follow.current_value),
        pnl: Number(follow.pnl),
        pnl_percent: Number(follow.pnl_percent)
      });
    });

    // Calculate weighted average PnL %
    if (summary.total_invested > 0) {
      summary.total_pnl_percent = (summary.total_pnl / summary.total_invested) * 100;
    }

    return res.status(200).json(summary);
  } catch (err) {
    console.error('API error:', err);
    if (/invalid input syntax for type uuid/i.test(String(err?.message || ''))) {
      return res.status(500).json({ error: 'Copy-trading database schema mismatch: user_follows.trader_id must be INTEGER. Run 20260820-fix-copy-trading-traders.sql in Supabase.' });
    }
    res.status(500).json({ error: err.message });
  }
}

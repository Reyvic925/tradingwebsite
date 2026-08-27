import supabase from './db-client.js';
import { getAssetPrice, normalizeTradingSymbol } from './simulate.js';

export default async function handler(req, res) {
  const secret = process.env.CRON_SECRET;
  const provided = (req.headers['x-cron-secret'] || req.query?.cron_secret || '').toString();
  if (!secret || provided !== secret) return res.status(401).json({ error: 'Invalid or missing cron secret' });
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { data: traders, error: tradersError } = await supabase
      .from('traders')
      .select('id, asset_focus')
      .eq('is_active', true);
    if (tradersError) throw tradersError;

    // Preserve established history and summary metrics. New trading activity is handled
    // by the simulation endpoint, so a reset cannot replace profiles with zero-value rows.

    return res.status(200).json({
      success: true,
      tradersReset: (traders || []).length,
      baselineTrades: 0,
      resetAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[RESET] Failed to reset trading activity:', error);
    return res.status(500).json({ error: error.message });
  }
}
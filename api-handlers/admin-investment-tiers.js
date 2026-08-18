import supabase from './db-client.js';
import { requireAdmin } from './auth-admin.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Admin-Secret');
  if (req.method === 'OPTIONS') return res.status(204).end();

  try {
    const adminAuth = await requireAdmin(req);
    if (!adminAuth) return res.status(403).json({ error: 'Forbidden' });

    // GET all tiers
    if (req.method === 'GET') {
      const { data, error } = await supabase.from('investment_tiers').select('*').order('tier_level', { ascending: true });
      if (error) throw error;
      return res.status(200).json(data || []);
    }

    // POST create new tier
    if (req.method === 'POST') {
      const { name, tier_level, percent_return, duration_days, min_investment, max_investment, roi_min, roi_max, volatility_min, volatility_max } = req.body || {};
      if (!name || !tier_level || !percent_return || !duration_days || !min_investment || !max_investment) {
        return res.status(400).json({ error: 'Missing required fields' });
      }

      const { data, error } = await supabase.from('investment_tiers').insert({
        name,
        tier_level,
        percent_return,
        duration_days,
        min_investment,
        max_investment,
        roi_min: roi_min || 15,
        roi_max: roi_max || 22,
        volatility_min: volatility_min || 5,
        volatility_max: volatility_max || 10,
        simulation_enabled: true,
      }).select();
      if (error) throw error;
      return res.status(201).json(data[0]);
    }

    // PUT update tier
    if (req.method === 'PUT') {
      const { id, ...updates } = req.body || {};
      if (!id) return res.status(400).json({ error: 'Missing tier id' });

      const { data, error } = await supabase.from('investment_tiers').update(updates).eq('id', id).select();
      if (error) throw error;
      return res.status(200).json(data[0]);
    }

    // DELETE tier
    if (req.method === 'DELETE') {
      const { id } = req.query || {};
      if (!id) return res.status(400).json({ error: 'Missing tier id' });

      const { error } = await supabase.from('investment_tiers').delete().eq('id', id);
      if (error) throw error;
      return res.status(204).end();
    }

    res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('[admin-tiers] error', err);
    return res.status(500).json({ error: String(err?.message || err) });
  }
}

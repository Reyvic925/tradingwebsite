import supabase from './db-client.js';
import { requireAdmin } from './auth-admin.js';
import { getDefaultPlans } from './plans.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Admin-Secret');
  if (req.method === 'OPTIONS') return res.status(204).end();

  try {
    const adminAuth = await requireAdmin(req);
    if (!adminAuth) return res.status(403).json({ error: 'Forbidden: admin auth required' });

    if (req.method === 'GET') {
      const { data, error } = await supabase.from('plans').select('*').order('id', { ascending: true });
      if (error) throw error;
      return res.status(200).json({ plans: data || [] });
    }

    if (req.method === 'POST' || req.method === 'PUT' || req.method === 'PATCH') {
      const body = req.body || {};
      const planId = Number(body.id ?? body.plan_id ?? 0);
      const base = {
        name: body.name,
        tagline: body.tagline,
        min_amount: Number(body.min_amount ?? 0),
        max_amount: body.max_amount == null || body.max_amount === '' ? null : Number(body.max_amount),
        daily_rate: Number(body.daily_rate ?? (body.total_return && body.duration_days ? (Number(body.total_return) / Number(body.duration_days)) : 0)),
        duration_days: Number(body.duration_days ?? 0),
        total_return: Number(body.total_return ?? 0),
        featured: Boolean(body.featured),
      };

      if (!base.name || !Number.isFinite(base.min_amount) || !Number.isFinite(base.total_return) || !Number.isFinite(base.duration_days)) {
        return res.status(400).json({ error: 'name, min_amount, total_return, and duration_days are required' });
      }

      const defaultPlan = getDefaultPlans().find((p) => p.id === planId) || null;
      if (base.min_amount < 200 && !defaultPlan) {
        return res.status(400).json({ error: 'Minimum investment must be at least $200' });
      }

      let result;
      if (planId) {
        const { data, error } = await supabase.from('plans').update(base).eq('id', planId).select();
        if (error) throw error;
        result = data?.[0] || null;
      } else {
        const { data, error } = await supabase.from('plans').insert([base]).select();
        if (error) throw error;
        result = data?.[0] || null;
      }

      return res.status(200).json({ plan: result });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('[admin-plans] error', err?.message || err);
    res.status(500).json({ error: String(err?.message || err) });
  }
}

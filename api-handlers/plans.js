import supabase from './db-client.js';
import { getDefaultPlans } from './plan-data.js';

export { getDefaultPlans };

export async function ensureDefaultPlans() {
  const defaults = getDefaultPlans();
  const { data: existingRows, error: fetchErr } = await supabase.from('plans').select('*').order('id', { ascending: true });
  if (fetchErr) throw fetchErr;

  const existingById = new Map((existingRows || []).map((plan) => [Number(plan.id), plan]));
  for (const plan of defaults) {
    const id = Number(plan.id);
    const existing = existingById.get(id);
    if (existing) {
      const { error: updateErr } = await supabase.from('plans').update({ ...plan, id }).eq('id', id);
      if (updateErr) throw updateErr;
    } else {
      const { error: insertErr } = await supabase.from('plans').insert([plan]);
      if (insertErr) throw insertErr;
    }
  }

  return defaults;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(204).end();

  try {
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
    await ensureDefaultPlans();
    const { data, error } = await supabase.from('plans').select('*').order('id', { ascending: true });
    if (error) throw error;
    return res.status(200).json(data || []);
  } catch (err) {
    console.error('API error:', err);
    res.status(500).json({ error: err.message });
  }
}

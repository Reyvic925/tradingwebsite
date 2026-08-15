import supabase from './db-client.js';

export function getDefaultPlans() {
  return [
    { id: 1, name: 'Starter', tagline: 'First desk allocation', min_amount: 200, max_amount: 999, daily_rate: 2.5, duration_days: 6, total_return: 275, featured: false },
    { id: 2, name: 'Premium', tagline: 'The house favorite', min_amount: 1000, max_amount: 4900, daily_rate: 3.5, duration_days: 7, total_return: 357, featured: true },
    { id: 3, name: 'Gold', tagline: 'For serious books', min_amount: 5000, max_amount: 24900, daily_rate: 4.5, duration_days: 9, total_return: 480, featured: false },
    { id: 4, name: 'Diamond', tagline: 'Private client mandate', min_amount: 25000, max_amount: null, daily_rate: 6, duration_days: 14, total_return: 640, featured: false },
  ];
}

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

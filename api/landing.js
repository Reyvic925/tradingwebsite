import supabase from './db-client.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(204).end();

  try {
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

    const [features, partners, stats, plans, testimonials] = await Promise.all([
      supabase.from('features').select('*').order('id', { ascending: true }),
      supabase.from('partners').select('*').order('id', { ascending: true }),
      supabase.from('platform_stats').select('*').order('id', { ascending: true }),
      supabase.from('plans').select('*').order('id', { ascending: true }),
      supabase.from('testimonials').select('*').order('id', { ascending: true }),
    ]);

    const err = features.error || partners.error || stats.error || plans.error || testimonials.error;
    if (err) throw err;

    return res.status(200).json({
      features: features.data || [],
      partners: partners.data || [],
      stats: stats.data || [],
      plans: plans.data || [],
      testimonials: testimonials.data || [],
    });
  } catch (err) {
    console.error('API error:', err);
    res.status(500).json({ error: err.message });
  }
}

export function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-admin-secret');
}

export function first(data) {
  if (Array.isArray(data)) return data[0] || null;
  return data || null;
}

export async function requireUser(supabase, req) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return null;
  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) return null;
  return user;
}

export async function getUsdWallet(supabase, userId) {
  const { data, error } = await supabase
    .from('wallets')
    .select('*')
    .eq('user_id', userId)
    .eq('currency', 'USD')
    .order('id', { ascending: true });
  if (error) throw error;
  const rows = data || [];
  if (!rows.length) return null;
  if (rows.length === 1) return rows[0];

  const keep = rows[0];
  const available = rows.reduce((s, r) => s + Number(r.available || 0), 0);
  const reserved = rows.reduce((s, r) => s + Number(r.reserved || 0), 0);
  await supabase.from('wallets').update({ available, reserved }).eq('id', keep.id);
  for (const extra of rows.slice(1)) {
    await supabase.from('wallets').delete().eq('id', extra.id);
  }
  return { ...keep, available, reserved };
}

export async function getOrCreateWallet(supabase, userId, starting = 1000) {
  let wallet = await getUsdWallet(supabase, userId);
  if (wallet) return wallet;
  const { data, error } = await supabase
    .from('wallets')
    .insert({ user_id: userId, currency: 'USD', available: starting, reserved: 0 })
    .select();
  if (error) {
    wallet = await getUsdWallet(supabase, userId);
    if (wallet) return wallet;
    throw error;
  }
  return first(data);
}

export async function getProfileRow(supabase, userId) {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('user_id', userId)
    .order('id', { ascending: true })
    .limit(1);
  if (error) throw error;
  return first(data);
}

export async function firstOpenPosition(supabase, userId, marketId) {
  const { data, error } = await supabase
    .from('positions')
    .select('*')
    .eq('user_id', userId)
    .eq('market_id', marketId)
    .eq('status', 'open')
    .order('id', { ascending: true })
    .limit(1);
  if (error) throw error;
  return first(data);
}

export async function findById(supabase, table, id) {
  if (id == null) return null;
  const { data, error } = await supabase.from(table).select('*').eq('id', id).limit(1);
  if (error) throw error;
  return first(data);
}

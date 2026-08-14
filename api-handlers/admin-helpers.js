import supabase from './db-client.js';

export async function logAdminAction(adminId, action, targetType = null, targetId = null, details = {}) {
  const { data, error } = await supabase
    .from('admin_audit_log')
    .insert({ admin_id: adminId, action, target_type: targetType, target_id: targetId ? String(targetId) : null, details })
    .select();
  if (error) {
    console.error('[admin-helpers] logAdminAction failed', error.message);
    return { error };
  }
  return { data: data?.[0] };
}

export async function insertPriceHistory(marketId, o, h, l, c, volume = 0, ts = null, meta = {}) {
  const payload = { market_id: marketId, open: o, high: h, low: l, close: c, volume, meta };
  if (ts) payload.ts = ts;
  const { data, error } = await supabase.from('price_history').insert(payload).select();
  if (error) {
    console.error('[admin-helpers] insertPriceHistory failed', error.message);
    return { error };
  }
  return { data: data?.[0] };
}

export async function createCryptoAddress(userId, currency, address, encryptedPrivateKey, encryptedMnemonic = null, metadata = {}, network = null) {
  const payload = {
    user_id: userId,
    currency,
    address,
    encrypted_private_key: encryptedPrivateKey,
    encrypted_mnemonic: encryptedMnemonic,
    metadata,
    network: network || metadata?.network || null,
  };
  const { data, error } = await supabase.from('crypto_addresses').insert(payload).select();
  if (error) {
    console.error('[admin-helpers] createCryptoAddress failed', error.message);
    return { error };
  }
  return { data: data?.[0] };
}

export async function listCryptoAddresses({ userId = null, currency = null, network = null, limit = 100, offset = 0 } = {}) {
  let q = supabase.from('crypto_addresses').select('*');
  if (userId) q = q.eq('user_id', userId);
  if (currency) q = q.eq('currency', currency);
  if (network) q = q.eq('network', network);
  const lim = Math.max(1, Number(limit) || 100);
  const off = Math.max(0, Number(offset) || 0);
  const { data, error } = await q.order('created_at', { ascending: false }).range(off, off + lim - 1);
  if (error) {
    console.error('[admin-helpers] listCryptoAddresses failed', error.message);
    return { error };
  }
  return { data };
}

export async function insertKycSubmission(userId, personalData = {}, documents = [], metadata = {}) {
  const { data, error } = await supabase
    .from('kyc_submissions')
    .insert({ user_id: userId, personal_data: personalData, documents, metadata })
    .select();
  if (error) {
    console.error('[admin-helpers] insertKycSubmission failed', error.message);
    return { error };
  }
  return { data: data?.[0] };
}

export async function updateKycSubmission(id, updates = {}) {
  const { data, error } = await supabase.from('kyc_submissions').update(updates).eq('id', id).select();
  if (error) {
    console.error('[admin-helpers] updateKycSubmission failed', error.message);
    return { error };
  }
  return { data: data?.[0] };
}

export async function listKycSubmissions({ status = null, limit = 100, offset = 0 } = {}) {
  let q = supabase.from('kyc_submissions').select('*');
  if (status) q = q.eq('status', status);
  const lim = Math.max(1, Number(limit) || 100);
  const off = Math.max(0, Number(offset) || 0);
  const { data, error } = await q.order('submitted_at', { ascending: false }).range(off, off + lim - 1);
  if (error) {
    console.error('[admin-helpers] listKycSubmissions failed', error.message);
    return { error };
  }
  return { data };
}

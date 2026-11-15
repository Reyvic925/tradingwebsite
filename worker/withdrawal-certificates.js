import { getAuthenticatedUser } from './auth.js';

const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });

export async function handleWithdrawalCertificates(request, env) {
  try {
    const user = await getAuthenticatedUser(request, env);
    if (!user) return json({ error: 'Unauthorized' }, 401);
    if (request.method !== 'GET') return json({ error: 'Method not allowed' }, 405);
    const url = new URL(request.url), id = url.searchParams.get('id');
    if (id && !/^(transaction|request)-[1-9]\d*$/.test(id)) return json({ error: 'Invalid certificate reference' }, 400);
    const offset = Math.min(1000000, Math.max(0, Math.trunc(Number(url.searchParams.get('offset')) || 0)));
    const rows = await env.DB.prepare(`SELECT * FROM (
      SELECT 'transaction-'||id AS id, amount, currency AS requested_currency,status,reference,created_at,reviewed_at AS reviewed_at,'crypto' AS kind
        FROM transactions WHERE user_id=? AND type='withdrawal'
      UNION ALL
      SELECT 'request-'||id AS id,amount,currency AS requested_currency,status,operation_id AS reference,created_at,processed_at AS reviewed_at,type AS kind
        FROM withdrawals WHERE user_id=?
      ) WHERE (? IS NULL OR id=?) ORDER BY julianday(created_at) DESC,id DESC LIMIT ? OFFSET ?`)
      .bind(user.id,user.id,id,id,id ? 1 : 51,id ? 0 : offset).all();
    if (id && !rows.results?.length) return json({ error: 'Withdrawal record not found' }, 404);
    const profile = await env.DB.prepare('SELECT full_name FROM profiles WHERE user_id=?').bind(user.id).first();
    const items = (rows.results || []).slice(0,50).map(row => ({
      id: row.id, certificate_number: `PM-WD-${row.id.startsWith('transaction-') ? 'T' : 'R'}${row.id.split('-')[1].padStart(8,'0')}`,
      amount: Number(row.amount), amount_currency: 'USD', requested_currency: row.requested_currency,
      status: row.status, reference: row.reference || row.id, created_at: row.created_at, reviewed_at: row.reviewed_at,
      kind: row.kind, account_name: profile?.full_name || null,
    }));
    return id ? json(items[0]) : json({ items, has_more: rows.results.length > 50, next_offset: offset + items.length });
  } catch (error) {
    console.error('[withdrawal-certificates]', error);
    return json({ error: 'Withdrawal certificates are temporarily unavailable.' }, 503);
  }
}

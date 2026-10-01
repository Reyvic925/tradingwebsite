import { getAuthenticatedUser } from './auth.js';
import { getD1Admin } from './admin-auth.js';
import { notifyUser } from './notifications.js';

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    },
  });
}

async function readBody(request) {
  try {
    const body = await request.json();
    return body && typeof body === 'object' ? body : {};
  } catch {
    return {};
  }
}

async function createWithdrawal(request, env, user) {
  if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405);
  const body = await readBody(request);
  const amount = Number(body.amount);
  const currency = String(body.currency || 'USDT').trim().toUpperCase();
  const address = String(body.address || '').trim();
  if (!Number.isFinite(amount) || amount <= 0) return json({ error: 'Amount must be positive.' }, 400);
  if (!/^[A-Z0-9]{2,12}$/.test(currency)) return json({ error: 'A valid currency is required.' }, 400);
  if (!address || address.length > 256) return json({ error: 'A valid destination address is required.' }, 400);

  const profile = await env.DB.prepare('SELECT kyc_status FROM profiles WHERE user_id = ?')
    .bind(user.id).first();
  if (profile?.kyc_status !== 'verified') {
    return json({ error: 'KYC verification is required before withdrawing.' }, 403);
  }

  const reference = `WDR-${crypto.randomUUID()}`;
  const results = await env.DB.batch([
    env.DB.prepare(`
      UPDATE wallets SET available = available - ?
      WHERE user_id = ? AND currency = 'USD' AND available >= ?
    `).bind(amount, user.id, amount),
    env.DB.prepare(`
      INSERT INTO transactions (user_id, type, amount, currency, method, status, reference, external_address)
      SELECT ?, 'withdrawal', ?, ?, 'crypto', 'pending', ?, ?
      WHERE changes() = 1
      RETURNING *
    `).bind(user.id, amount, currency, reference, address),
    env.DB.prepare(`
      INSERT INTO wallet_ledger (user_id, currency, entry_type, amount, source_type, source_id, created_by)
      SELECT user_id, 'USD', 'debit', amount, 'withdrawal_debit', id, user_id
      FROM transactions WHERE reference = ? AND type = 'withdrawal'
    `).bind(reference),
  ]);

  const transaction = results[1]?.results?.[0];
  if (!transaction) return json({ error: 'Insufficient available balance.' }, 400);
  await notifyUser(env, user.id, 'Crypto withdrawal requested', `Your withdrawal of ${amount} ${currency} was submitted for review.`, 'worker/withdrawal-api');
  return json({ ok: true, tx: transaction }, 201);
}

async function listWithdrawals(request, env) {
  const params = new URL(request.url).searchParams;
  const status = params.get('status') || 'pending';
  if (!['pending', 'approved', 'rejected', 'all'].includes(status)) {
    return json({ error: 'Invalid withdrawal status filter.' }, 400);
  }
  const limit = Math.min(500, Math.max(1, Number(params.get('limit')) || 200));
  const offset = Math.max(0, Number(params.get('offset')) || 0);
  const result = await env.DB.prepare(`
    SELECT t.*, p.email AS user_email, p.full_name AS user_name,
      COALESCE(w.available, 0) AS wallet_balance, w.currency AS wallet_currency
    FROM transactions t
    LEFT JOIN profiles p ON p.user_id = t.user_id
    LEFT JOIN wallets w ON w.user_id = t.user_id AND w.currency = 'USD'
    WHERE t.type = 'withdrawal' AND (? = 'all' OR t.status = ?)
    ORDER BY t.id DESC
    LIMIT ? OFFSET ?
  `).bind(status, status, limit, offset).all();
  return json({ withdrawals: result.results || [] });
}

async function reviewWithdrawal(request, env, admin) {
  if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405);
  const body = await readBody(request);
  const id = Number(body.id);
  const action = String(body.action || '');
  const notes = String(body.admin_notes || '').trim().slice(0, 2000);
  if (!Number.isSafeInteger(id) || id <= 0 || !['approve', 'reject'].includes(action)) {
    return json({ error: 'A valid withdrawal id and approve/reject action are required.' }, 400);
  }

  const status = action === 'approve' ? 'approved' : 'rejected';
  const reviewedAt = new Date().toISOString();
  const update = env.DB.prepare(`
    UPDATE transactions
    SET status = ?, reviewed_at = ?, reviewed_by = ?, admin_notes = ?
    WHERE id = ? AND type = 'withdrawal' AND status = 'pending'
    RETURNING *
  `).bind(status, reviewedAt, admin.id, notes || null, id);

  const results = action === 'reject'
    ? await env.DB.batch([
      update,
      env.DB.prepare(`
        UPDATE wallets SET available = available + (
          SELECT amount FROM transactions WHERE id = ? AND status = 'rejected' AND reviewed_at = ?
        )
        WHERE user_id = (
          SELECT user_id FROM transactions WHERE id = ? AND status = 'rejected' AND reviewed_at = ?
        ) AND currency = 'USD' AND changes() = 1
      `).bind(id, reviewedAt, id, reviewedAt),
      env.DB.prepare(`
        INSERT INTO wallet_ledger (user_id, currency, entry_type, amount, source_type, source_id, created_by)
        SELECT user_id, 'USD', 'credit', amount, 'withdrawal_refund', id, ?
        FROM transactions WHERE id = ? AND status = 'rejected' AND reviewed_by = ? AND reviewed_at = ?
      `).bind(admin.id, id, admin.id, reviewedAt),
      env.DB.prepare(`
        INSERT INTO admin_audit_logs (admin_user_id, action, entity_type, entity_id, details_json)
        SELECT ?, 'withdrawal.reject', 'transaction', CAST(id AS TEXT),
          json_object('amount', amount, 'currency', currency, 'user_id', user_id, 'admin_notes', ?)
        FROM transactions WHERE id = ? AND status = 'rejected' AND reviewed_by = ? AND reviewed_at = ?
      `).bind(admin.id, notes, id, admin.id, reviewedAt),
    ])
    : await env.DB.batch([
      update,
      env.DB.prepare(`
        INSERT INTO admin_audit_logs (admin_user_id, action, entity_type, entity_id, details_json)
        SELECT ?, 'withdrawal.approve', 'transaction', CAST(id AS TEXT),
          json_object('amount', amount, 'currency', currency, 'user_id', user_id, 'admin_notes', ?)
        FROM transactions WHERE id = ? AND status = 'approved' AND reviewed_by = ? AND reviewed_at = ?
          AND changes() = 1
      `).bind(admin.id, notes, id, admin.id, reviewedAt),
    ]);

  const withdrawal = results[0]?.results?.[0];
  if (!withdrawal) return json({ error: 'Withdrawal not found or already reviewed.' }, 409);
  await notifyUser(env, withdrawal.user_id,
    action === 'approve' ? 'Crypto withdrawal approved' : 'Crypto withdrawal rejected',
    action === 'approve'
      ? `Your withdrawal of ${withdrawal.amount} ${withdrawal.currency} was approved.`
      : `Your withdrawal of ${withdrawal.amount} ${withdrawal.currency} was rejected.${notes ? ` Note: ${notes}` : ''}`,
    'worker/withdrawal-api');
  return json({ withdrawal });
}

export async function handleWithdrawalRequest(request, env) {
  try {
    const pathname = new URL(request.url).pathname;
    if (pathname === '/api/admin/withdrawals') {
      const admin = await getD1Admin(request, env);
      if (!admin) return json({ error: 'Forbidden' }, 403);
      if (request.method === 'GET') return await listWithdrawals(request, env);
      return await reviewWithdrawal(request, env, admin);
    }

    const user = await getAuthenticatedUser(request, env);
    if (!user) return json({ error: 'Unauthorized' }, 401);
    if (pathname === '/api/user/withdraw/crypto') return await createWithdrawal(request, env, user);
    return json({ error: 'Not found' }, 404);
  } catch (error) {
    console.error('[worker/withdrawal-api]', error);
    return json({ error: 'Internal server error' }, 500);
  }
}
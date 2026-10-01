import { getAuthenticatedUser } from './auth.js';
import { getD1Admin } from './admin-auth.js';
import { sendUserEmail } from './email.js';

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
    return null;
  }
}

async function listUserWithdrawals(env, user) {
  const result = await env.DB.prepare(`
    SELECT * FROM withdrawals WHERE user_id = ? ORDER BY created_at DESC LIMIT 100
  `).bind(user.id).all();
  return json(result.results || []);
}

async function createWithdrawal(request, env, user) {
  if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405);
  const body = await readBody(request);
  if (!body) return json({ error: 'A JSON body is required.' }, 400);
  const type = String(body.type || 'regular').trim();
  const amount = Number(body.amount);
  const currency = String(body.currency || 'USD').trim().toUpperCase();
  if (!['regular', 'roi'].includes(type) || !Number.isFinite(amount) || amount <= 0) {
    return json({ error: 'A valid withdrawal type and positive amount are required.' }, 400);
  }
  if (!/^[A-Z0-9]{2,12}$/.test(currency)) return json({ error: 'A valid currency is required.' }, 400);

  const profile = await env.DB.prepare('SELECT kyc_status FROM profiles WHERE user_id = ?')
    .bind(user.id).first();
  if (profile?.kyc_status !== 'verified') return json({ error: 'KYC verification is required before withdrawing.' }, 403);

  const operationId = crypto.randomUUID();
  if (type === 'regular') {
    const results = await env.DB.batch([
      env.DB.prepare(`
        UPDATE wallets SET available = available - ?
        WHERE user_id = ? AND currency = 'USD' AND available >= ?
      `).bind(amount, user.id, amount),
      env.DB.prepare(`
        INSERT INTO withdrawals
          (operation_id, user_id, type, amount, currency, status, fee_stage, deducted_from_available)
        SELECT ?, ?, 'regular', ?, ?, 'pending', 'awaiting_activation_fee', 1
        WHERE changes() = 1
        RETURNING *
      `).bind(operationId, user.id, amount, currency),
      env.DB.prepare(`
        INSERT INTO wallet_ledger (user_id, currency, entry_type, amount, source_type, source_id, created_by)
        SELECT user_id, 'USD', 'debit', amount, 'withdrawal_request', id, user_id
        FROM withdrawals WHERE operation_id = ?
      `).bind(operationId),
      env.DB.prepare(`
        INSERT INTO notifications (user_id, title, body, read)
        SELECT user_id, 'Withdrawal initiated', ?, 0
        FROM withdrawals WHERE operation_id = ?
      `).bind(`Withdrawal of ${amount} ${currency} initiated. Awaiting approval.`, operationId),
    ]);
    const withdrawal = results[1]?.results?.[0];
    if (!withdrawal) return json({ error: 'Insufficient available balance.' }, 400);
    await sendUserEmail(env, user.id, {
      subject: 'Withdrawal initiated',
      text: `Withdrawal of ${amount} ${currency} initiated. Awaiting approval.`,
    }, 'worker/roi-withdrawal-api');
    return json(withdrawal, 201);
  }

  const investmentId = Number(body.investment_id);
  if (!Number.isSafeInteger(investmentId) || investmentId <= 0) {
    return json({ error: 'A valid investment_id is required for ROI withdrawals.' }, 400);
  }
  const investment = await env.DB.prepare(`
    SELECT id, status FROM investments WHERE id = ? AND user_id = ?
  `).bind(investmentId, user.id).first();
  if (!investment) return json({ error: 'Investment not found.' }, 404);
  if (investment.status !== 'completed') return json({ error: 'ROI can only be withdrawn after the investment matures.' }, 409);

  const pending = await env.DB.prepare(`
    SELECT id FROM withdrawals
    WHERE user_id = ? AND investment_id = ? AND type = 'roi' AND status = 'pending'
    LIMIT 1
  `).bind(user.id, investmentId).first();
  if (pending) return json({ error: 'A withdrawal request is already pending for this investment.' }, 409);

  const results = await env.DB.batch([
    env.DB.prepare(`
      INSERT OR IGNORE INTO wallets (user_id, currency, available, reserved, locked_balance)
      VALUES (?, 'USD', 0, 0, 0)
    `).bind(user.id),
    env.DB.prepare(`
      UPDATE profiles SET locked_balance = locked_balance - ?
      WHERE user_id = ? AND locked_balance >= ?
    `).bind(amount, user.id, amount),
    env.DB.prepare(`
      INSERT INTO withdrawals
        (operation_id, user_id, investment_id, type, amount, currency, status, fee_stage, from_locked_balance)
      SELECT ?, ?, ?, 'roi', ?, ?, 'pending', 'awaiting_activation_fee', 1
      WHERE changes() = 1
      RETURNING *
    `).bind(operationId, user.id, investmentId, amount, currency),
    env.DB.prepare(`
      UPDATE investments SET roi_withdrawal_pending = 1
      WHERE id = ? AND user_id = ? AND EXISTS (
        SELECT 1 FROM withdrawals WHERE operation_id = ?
      )
    `).bind(investmentId, user.id, operationId),
    env.DB.prepare(`
      INSERT INTO notifications (user_id, title, body, read)
      SELECT user_id, 'ROI withdrawal initiated', ?, 0
      FROM withdrawals WHERE operation_id = ?
    `).bind(`ROI withdrawal of $${amount} initiated. Awaiting admin approval.`, operationId),
  ]);
  const withdrawal = results[2]?.results?.[0];
  if (!withdrawal) return json({ error: 'Insufficient locked balance.' }, 400);
  await sendUserEmail(env, user.id, {
    subject: 'ROI withdrawal initiated',
    text: `ROI withdrawal of $${amount} initiated. Awaiting admin approval.`,
  }, 'worker/roi-withdrawal-api');
  return json(withdrawal, 201);
}

async function listAdminRoiWithdrawals(request, env) {
  const params = new URL(request.url).searchParams;
  const status = params.get('status') || 'pending';
  if (!['pending', 'approved', 'rejected', 'all'].includes(status)) {
    return json({ error: 'Invalid ROI withdrawal status.' }, 400);
  }
  const result = await env.DB.prepare(`
    SELECT w.*, p.email AS user_email, p.full_name AS user_name,
      i.plan_name AS investment_plan_name, i.amount AS investment_amount,
      i.current_value AS investment_current_value, i.status AS investment_status
    FROM withdrawals w
    LEFT JOIN profiles p ON p.user_id = w.user_id
    LEFT JOIN investments i ON i.id = w.investment_id
    WHERE w.type = 'roi' AND (? = 'all' OR w.status = ?)
    ORDER BY w.created_at DESC LIMIT 100
  `).bind(status, status).all();
  const withdrawals = (result.results || []).map((row) => ({
    ...row,
    investment: row.investment_id == null ? null : {
      id: row.investment_id,
      plan_name: row.investment_plan_name,
      amount: row.investment_amount,
      current_value: row.investment_current_value,
      status: row.investment_status,
    },
  }));
  return json({ withdrawals });
}

async function reviewRoiWithdrawal(request, env, admin) {
  if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405);
  const body = await readBody(request);
  const id = Number(body?.id);
  const action = String(body?.action || '');
  const notes = String(body?.admin_notes || '').trim().slice(0, 2000);
  if (!Number.isSafeInteger(id) || id <= 0 || !['approve', 'reject'].includes(action)) {
    return json({ error: 'A valid withdrawal id and approve/reject action are required.' }, 400);
  }

  const status = action === 'approve' ? 'approved' : 'rejected';
  const reviewedAt = new Date().toISOString();
  const statements = [env.DB.prepare(`
    UPDATE withdrawals
    SET status = ?, admin_notes = ?, approved_at = ?, processed_at = ?, processed_by = ?
    WHERE id = ? AND type = 'roi' AND status = 'pending'
    RETURNING *
  `).bind(status, notes || null, action === 'approve' ? reviewedAt : null, reviewedAt, admin.id, id)];

  if (action === 'approve') {
    statements.push(env.DB.prepare(`
      UPDATE wallets SET available = available + (
        SELECT amount FROM withdrawals WHERE id = ? AND type = 'roi' AND status = 'approved'
          AND processed_by = ? AND processed_at = ?
      )
      WHERE user_id = (
        SELECT user_id FROM withdrawals WHERE id = ? AND type = 'roi' AND status = 'approved'
          AND processed_by = ? AND processed_at = ?
      ) AND currency = 'USD' AND changes() = 1
    `).bind(id, admin.id, reviewedAt, id, admin.id, reviewedAt));
    statements.push(env.DB.prepare(`
      INSERT INTO wallet_ledger (user_id, currency, entry_type, amount, source_type, source_id, created_by)
      SELECT user_id, 'USD', 'credit', amount, 'roi_withdrawal', id, ?
      FROM withdrawals WHERE id = ? AND type = 'roi' AND status = 'approved'
        AND processed_by = ? AND processed_at = ?
    `).bind(admin.id, id, admin.id, reviewedAt));
  } else {
    statements.push(env.DB.prepare(`
      UPDATE profiles SET locked_balance = locked_balance + (
        SELECT amount FROM withdrawals WHERE id = ? AND type = 'roi' AND status = 'rejected'
          AND processed_by = ? AND processed_at = ?
      )
      WHERE user_id = (
        SELECT user_id FROM withdrawals WHERE id = ? AND type = 'roi' AND status = 'rejected'
          AND processed_by = ? AND processed_at = ?
      ) AND changes() = 1
    `).bind(id, admin.id, reviewedAt, id, admin.id, reviewedAt));
  }

  statements.push(env.DB.prepare(`
    UPDATE investments SET roi_withdrawal_pending = 0
    WHERE id = (SELECT investment_id FROM withdrawals WHERE id = ? AND type = 'roi'
      AND status = ? AND processed_by = ? AND processed_at = ?)
  `).bind(id, status, admin.id, reviewedAt));
  statements.push(env.DB.prepare(`
    INSERT INTO notifications (user_id, title, body, read)
    SELECT user_id, ?, ?, 0 FROM withdrawals
    WHERE id = ? AND type = 'roi' AND status = ? AND processed_by = ? AND processed_at = ?
  `).bind(
    action === 'approve' ? 'ROI withdrawal approved' : 'ROI withdrawal rejected',
    action === 'approve'
      ? 'Your ROI withdrawal was approved and credited to your available balance.'
      : 'Your ROI withdrawal was rejected. Funds were returned to your locked balance.',
    id,
    status,
    admin.id,
    reviewedAt,
  ));
  statements.push(env.DB.prepare(`
    INSERT INTO admin_audit_logs (admin_user_id, action, entity_type, entity_id, details_json)
    SELECT ?, ?, 'withdrawal', CAST(id AS TEXT),
      json_object('amount', amount, 'type', type, 'user_id', user_id, 'admin_notes', ?)
    FROM withdrawals WHERE id = ? AND type = 'roi' AND status = ? AND processed_by = ? AND processed_at = ?
  `).bind(admin.id, `withdrawal.${action}`, notes, id, status, admin.id, reviewedAt));

  const results = await env.DB.batch(statements);
  const withdrawal = results[0]?.results?.[0];
  if (!withdrawal) return json({ error: 'ROI withdrawal not found or already reviewed.' }, 409);
  if (withdrawal.user_id) {
    await sendUserEmail(env, withdrawal.user_id, {
      subject: action === 'approve' ? 'ROI withdrawal approved' : 'ROI withdrawal rejected',
      text: action === 'approve'
        ? 'Your ROI withdrawal was approved and credited to your available balance.'
        : 'Your ROI withdrawal was rejected. Funds were returned to your locked balance.',
    }, 'worker/roi-withdrawal-api');
  }
  return json(withdrawal);
}

export async function handleRoiWithdrawalRequest(request, env) {
  try {
    const pathname = new URL(request.url).pathname;
    if (pathname === '/api/admin/roi-approvals') {
      const admin = await getD1Admin(request, env);
      if (!admin) return json({ error: 'Forbidden' }, 403);
      if (request.method === 'GET') return await listAdminRoiWithdrawals(request, env);
      return await reviewRoiWithdrawal(request, env, admin);
    }

    const user = await getAuthenticatedUser(request, env);
    if (!user) return json({ error: 'Unauthorized' }, 401);
    if (pathname !== '/api/withdrawal-request') return json({ error: 'Not found' }, 404);
    if (request.method === 'GET') return await listUserWithdrawals(env, user);
    return await createWithdrawal(request, env, user);
  } catch (error) {
    if (/UNIQUE constraint failed: withdrawals\.investment_id/i.test(String(error?.message || ''))) {
      return json({ error: 'A withdrawal request is already pending for this investment.' }, 409);
    }
    console.error('[worker/roi-withdrawal-api]', error);
    return json({ error: 'Internal server error' }, 500);
  }
}
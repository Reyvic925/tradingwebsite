import { getAuthenticatedUser } from './auth.js';
import { getD1Admin } from './admin-auth.js';

const MAX_DOCUMENT_BYTES = 5 * 1024 * 1024;
const ALLOWED_MIMES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const ALLOWED_DOCUMENT_TYPES = new Set(['passport', 'national_id', 'drivers_license']);
const ALLOWED_DOCUMENT_KINDS = new Set(['document_front', 'document_back']);

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

async function sendNotificationEmail(env, userId, title, body) {
  const apiKey = String(env.RESEND_API_KEY || '').trim();
  const from = String(env.RESEND_FROM_EMAIL || '').trim();
  if (!apiKey || !from) {
    console.warn('[worker/kyc-api] email skipped: configure RESEND_API_KEY and RESEND_FROM_EMAIL on the Worker.');
    return;
  }
  const user = await env.DB.prepare('SELECT email FROM auth_users WHERE id = ?').bind(userId).first();
  if (!user?.email) return;
  try {
    const result = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to: [user.email], subject: title, text: body || title }),
    });
    if (!result.ok) {
      console.error('[worker/kyc-api] Resend rejected email:', result.status, (await result.text()).slice(0, 500));
    }
  } catch (error) {
    console.warn('[worker/kyc-api] notification email skipped:', error?.message || error);
  }
}

function sanitizeFilename(value) {
  return String(value || 'document').replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 120) || 'document';
}

function parseDataUrl(value) {
  const match = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/]+={0,2})$/.exec(String(value || '').trim());
  if (!match) return null;
  const binary = atob(match[2]);
  if (binary.length > MAX_DOCUMENT_BYTES) return null;
  return {
    mime: match[1].toLowerCase(),
    bytes: Uint8Array.from(binary, (character) => character.charCodeAt(0)),
  };
}

function validDate(value) {
  const text = String(value || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return null;
  const date = new Date(`${text}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== text ? null : date;
}

function ageFromDate(date) {
  const now = new Date();
  let age = now.getUTCFullYear() - date.getUTCFullYear();
  if (now.getUTCMonth() < date.getUTCMonth()
    || (now.getUTCMonth() === date.getUTCMonth() && now.getUTCDate() < date.getUTCDate())) age -= 1;
  return age;
}

function parseJson(value, fallback) {
  try {
    return JSON.parse(value || JSON.stringify(fallback));
  } catch {
    return fallback;
  }
}

async function uploadDocument(request, env, user) {
  if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405);
  if (!env.KYC_FILES) return json({ error: 'Private document storage is not configured.' }, 503);
  const body = await readBody(request);
  if (!body) return json({ error: 'A JSON body is required.' }, 400);
  const kind = String(body.kind || '').trim();
  if (!ALLOWED_DOCUMENT_KINDS.has(kind)) return json({ error: 'Invalid document kind.' }, 400);
  const parsed = parseDataUrl(body.data_url);
  if (!parsed || !ALLOWED_MIMES.has(parsed.mime)) {
    return json({ error: 'Upload a base64 JPEG, PNG, or WebP image no larger than 5 MB.' }, 400);
  }

  const objectKey = `kyc/${user.id}/${crypto.randomUUID()}`;
  const filename = sanitizeFilename(body.filename);
  await env.KYC_FILES.put(objectKey, parsed.bytes, {
    httpMetadata: { contentType: parsed.mime },
    customMetadata: { userId: user.id, kind },
  });

  try {
    const result = await env.DB.prepare(`
      INSERT INTO kyc_files (user_id, kind, mime, size, filename, r2_object_key)
      VALUES (?, ?, ?, ?, ?, ?)
      RETURNING id, kind, mime, size, filename, created_at
    `).bind(user.id, kind, parsed.mime, parsed.bytes.length, filename, objectKey).first();
    if (!result) throw new Error('KYC file metadata insert returned no row.');
    return json({ file: { id: result.id, kind: result.kind, mime: result.mime, size: result.size } }, 201);
  } catch (error) {
    await env.KYC_FILES.delete(objectKey).catch(() => {});
    throw error;
  }
}

async function getDocument(request, env, user) {
  const id = Number(new URL(request.url).searchParams.get('id'));
  if (!Number.isSafeInteger(id) || id <= 0) return json({ error: 'A valid file id is required.' }, 400);
  const file = await env.DB.prepare(`
    SELECT id, user_id, kind, mime, filename, r2_object_key
    FROM kyc_files WHERE id = ?
  `).bind(id).first();
  if (!file) return json({ error: 'File not found.' }, 404);

  if (file.user_id !== user.id && !(await getD1Admin(request, env))) return json({ error: 'Forbidden' }, 403);
  if (!env.KYC_FILES) return json({ error: 'Private document storage is not configured.' }, 503);
  const object = await env.KYC_FILES.get(file.r2_object_key);
  if (!object) return json({ error: 'Document object not found.' }, 404);

  const filename = sanitizeFilename(file.filename || `kyc-${file.id}`);
  return new Response(object.body, {
    headers: {
      'content-type': file.mime || object.httpMetadata?.contentType || 'application/octet-stream',
      'content-disposition': `inline; filename="${filename}"`,
      'cache-control': 'private, no-store',
      'x-content-type-options': 'nosniff',
    },
  });
}

function validateKycPayload(body) {
  const personal = body?.personal_data;
  if (!personal || typeof personal !== 'object' || Array.isArray(personal)) return { error: 'personal_data must be an object.' };
  const firstName = String(personal.first_name || '').trim();
  const lastName = String(personal.last_name || '').trim();
  const dob = validDate(personal.dob);
  const nationality = String(personal.nationality || '').trim();
  const country = String(personal.country || '').trim();
  const address = personal.address && typeof personal.address === 'object' ? personal.address : {};
  const document = personal.document && typeof personal.document === 'object' ? personal.document : {};
  const documentType = String(document.type || '').trim();
  const documentNumber = String(document.number || '').trim();
  const expiry = validDate(document.expiry_date);

  if (!firstName || !lastName) return { error: 'First name and last name are required.' };
  if (!dob) return { error: 'A valid date of birth is required.' };
  if (ageFromDate(dob) < 18) return { error: 'You must be at least 18 years old.' };
  if (!nationality || !country) return { error: 'Nationality and country of residence are required.' };
  if (!String(address.street || '').trim() || !String(address.city || '').trim()) {
    return { error: 'Residential street address and city are required.' };
  }
  if (!ALLOWED_DOCUMENT_TYPES.has(documentType) || !documentNumber) return { error: 'A supported document type and number are required.' };
  if (!expiry || expiry.getTime() <= Date.now()) return { error: 'A valid future document expiry date is required.' };
  if (!Array.isArray(body.documents) || body.documents.length === 0) return { error: 'At least one uploaded document is required.' };

  const documents = [];
  const kinds = new Set();
  for (const item of body.documents) {
    const kind = String(item?.kind || '').trim();
    const fileId = Number(item?.file_id);
    if (!ALLOWED_DOCUMENT_KINDS.has(kind) || !Number.isSafeInteger(fileId) || fileId <= 0 || kinds.has(kind)) {
      return { error: 'Each document must reference one unique uploaded front/back file.' };
    }
    kinds.add(kind);
    documents.push({ kind, file_id: fileId, name: sanitizeFilename(item.name) });
  }
  if (!kinds.has('document_front')) return { error: 'Front side of the identity document is required.' };
  if (documentType !== 'passport' && !kinds.has('document_back')) return { error: 'Back side of the identity document is required.' };

  const cleanPersonal = {
    first_name: firstName,
    last_name: lastName,
    full_name: `${firstName} ${lastName}`,
    dob: dob.toISOString().slice(0, 10),
    nationality,
    country,
    gender: personal.gender ? String(personal.gender).trim() : null,
    address: {
      street: String(address.street).trim(),
      city: String(address.city).trim(),
      state: String(address.state || '').trim() || null,
      postal_code: String(address.postal_code || '').trim() || null,
      country: String(address.country || country).trim(),
    },
    document: {
      type: documentType,
      number: documentNumber,
      expiry_date: expiry.toISOString().slice(0, 10),
    },
  };
  return { personal: cleanPersonal, documents };
}

async function submitKyc(request, env, user) {
  if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405);
  const body = await readBody(request);
  if (!body) return json({ error: 'A JSON body is required.' }, 400);
  const validation = validateKycPayload(body);
  if (validation.error) return json({ error: validation.error }, 400);

  const profile = await env.DB.prepare('SELECT kyc_status FROM profiles WHERE user_id = ?')
    .bind(user.id).first();
  if (!profile) return json({ error: 'Profile not found.' }, 404);
  if (profile.kyc_status === 'verified') return json({ error: 'Identity is already verified.' }, 409);

  const placeholders = validation.documents.map(() => '?').join(', ');
  const fileRows = await env.DB.prepare(`
    SELECT id, user_id, kind FROM kyc_files
    WHERE user_id = ? AND id IN (${placeholders})
  `).bind(user.id, ...validation.documents.map((document) => document.file_id)).all();
  const filesById = new Map((fileRows.results || []).map((file) => [Number(file.id), file]));
  for (const document of validation.documents) {
    const file = filesById.get(document.file_id);
    if (!file || file.user_id !== user.id) return json({ error: 'Uploaded document not found for this account.' }, 400);
    if (file.kind !== document.kind) return json({ error: 'Uploaded document type does not match the submission.' }, 400);
  }

  try {
    const results = await env.DB.batch([
      env.DB.prepare(`
        INSERT INTO kyc_submissions (user_id, personal_data, documents, metadata, status)
        VALUES (?, ?, ?, ?, 'pending')
        RETURNING *
      `).bind(
        user.id,
        JSON.stringify(validation.personal),
        JSON.stringify(validation.documents),
        JSON.stringify(body.metadata && typeof body.metadata === 'object' ? body.metadata : {}),
      ),
      env.DB.prepare(`
        UPDATE profiles SET kyc_status = 'pending'
        WHERE user_id = ? AND EXISTS (
          SELECT 1 FROM kyc_submissions WHERE user_id = ? AND status = 'pending'
        )
      `).bind(user.id, user.id),
      env.DB.prepare(`
        INSERT INTO notifications (user_id, title, body, read)
        SELECT ?, 'KYC application submitted',
          'Your identity documents were received and are under review.', 0
        WHERE changes() = 1
      `).bind(user.id),
    ]);
    const submission = results[0]?.results?.[0];
    if (!submission) throw new Error('KYC submission returned no row.');
    await sendNotificationEmail(env, user.id, 'KYC application submitted', 'Your identity documents were received and are under review.');
    return json({ submission: { ...submission, personal_data: validation.personal, documents: validation.documents } }, 201);
  } catch (error) {
    if (/unique/i.test(String(error?.message || ''))) return json({ error: 'You already have a KYC application under review.' }, 409);
    throw error;
  }
}

async function listUserKyc(env, user) {
  const result = await env.DB.prepare(`
    SELECT * FROM kyc_submissions WHERE user_id = ? ORDER BY submitted_at DESC
  `).bind(user.id).all();
  return json({ submissions: (result.results || []).map((submission) => ({
    ...submission,
    personal_data: parseJson(submission.personal_data, {}),
    documents: parseJson(submission.documents, []),
    metadata: parseJson(submission.metadata, {}),
  })) });
}

async function listAdminKyc(request, env) {
  const params = new URL(request.url).searchParams;
  const status = params.get('status') || 'pending';
  if (!['pending', 'approved', 'rejected', 'all'].includes(status)) return json({ error: 'Invalid KYC status filter.' }, 400);
  const limit = Math.min(200, Math.max(1, Number(params.get('limit')) || 100));
  const offset = Math.max(0, Number(params.get('offset')) || 0);
  const result = await env.DB.prepare(`
    SELECT s.*, p.email AS user_email, p.full_name AS user_name
    FROM kyc_submissions s LEFT JOIN profiles p ON p.user_id = s.user_id
    WHERE (? = 'all' OR s.status = ?)
    ORDER BY s.submitted_at DESC
    LIMIT ? OFFSET ?
  `).bind(status, status, limit, offset).all();
  return json({ submissions: (result.results || []).map((submission) => ({
    ...submission,
    personal_data: parseJson(submission.personal_data, {}),
    documents: parseJson(submission.documents, []),
    metadata: parseJson(submission.metadata, {}),
  })) });
}

async function reviewKyc(request, env, admin) {
  if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405);
  const body = await readBody(request);
  const id = Number(body?.id);
  const action = String(body?.action || '');
  const note = String(body?.admin_notes || '').trim().slice(0, 2000);
  if (!Number.isSafeInteger(id) || id <= 0 || !['approve', 'reject'].includes(action)) {
    return json({ error: 'A valid submission id and approve/reject action are required.' }, 400);
  }
  const status = action === 'approve' ? 'approved' : 'rejected';
  const profileStatus = action === 'approve' ? 'verified' : 'rejected';

  const results = await env.DB.batch([
    env.DB.prepare(`
      UPDATE kyc_submissions
      SET status = ?, reviewer_id = ?, reviewed_at = CURRENT_TIMESTAMP, admin_notes = ?
      WHERE id = ? AND status = 'pending'
      RETURNING *
    `).bind(status, admin.id, note || null, id),
    env.DB.prepare(`
      UPDATE profiles
      SET kyc_status = ?
      WHERE user_id = (SELECT user_id FROM kyc_submissions WHERE id = ? AND status = ? AND reviewer_id = ?)
    `).bind(profileStatus, id, status, admin.id),
    env.DB.prepare(`
      INSERT INTO notifications (user_id, title, body, read)
      SELECT user_id, ?, ?, 0
      FROM kyc_submissions WHERE id = ? AND status = ? AND reviewer_id = ?
    `).bind(
      action === 'approve' ? 'Identity verified' : 'KYC application rejected',
      action === 'approve' ? 'Your identity verification is complete. Withdrawals are now enabled.'
        : `Your KYC application was rejected.${note ? ` Reason: ${note}` : ''} You can submit a new application.`,
      id,
      status,
      admin.id,
    ),
    env.DB.prepare(`
      INSERT INTO admin_audit_logs (admin_user_id, action, entity_type, entity_id, details_json)
      SELECT ?, ?, 'kyc_submission', CAST(id AS TEXT), json_object('admin_notes', ?)
      FROM kyc_submissions WHERE id = ? AND status = ? AND reviewer_id = ?
    `).bind(admin.id, `kyc.${action}`, note, id, status, admin.id),
  ]);
  const submission = results[0]?.results?.[0];
  if (!submission) return json({ error: 'KYC submission not found or already reviewed.' }, 409);
  const targetUserId = submission.user_id || (await env.DB.prepare('SELECT user_id FROM kyc_submissions WHERE id = ?').bind(id).first())?.user_id;
  if (targetUserId) {
    await sendNotificationEmail(env, targetUserId, action === 'approve' ? 'Identity verified' : 'KYC application rejected', action === 'approve' ? 'Your identity verification is complete. Withdrawals are now enabled.' : `Your KYC application was rejected.${note ? ` Reason: ${note}` : ''} You can submit a new application.`);
  }
  return json({ submission: {
    ...submission,
    personal_data: parseJson(submission.personal_data, {}),
    documents: parseJson(submission.documents, []),
    metadata: parseJson(submission.metadata, {}),
  } });
}

async function handleUserKyc(request, env, user) {
  if (request.method === 'GET') return await listUserKyc(env, user);
  if (request.method === 'POST') return await submitKyc(request, env, user);
  return json({ error: 'Method not allowed.' }, 405);
}

async function handleAdminKyc(request, env, admin) {
  if (request.method === 'GET') return await listAdminKyc(request, env);
  if (request.method === 'POST') return await reviewKyc(request, env, admin);
  return json({ error: 'Method not allowed.' }, 405);
}

export async function handleKycRequest(request, env) {
  try {
    const pathname = new URL(request.url).pathname;
    if (pathname === '/api/admin/kyc') {
      const admin = await getD1Admin(request, env);
      if (!admin) return json({ error: 'Forbidden' }, 403);
      return await handleAdminKyc(request, env, admin);
    }

    const user = await getAuthenticatedUser(request, env);
    if (!user) return json({ error: 'Unauthorized' }, 401);
    if (pathname === '/api/user/kyc') return await handleUserKyc(request, env, user);
    if (pathname === '/api/kyc-upload' && request.method === 'POST') return await uploadDocument(request, env, user);
    if (pathname === '/api/kyc-upload' && request.method === 'GET') return await getDocument(request, env, user);
    return json({ error: 'Not found' }, 404);
  } catch (error) {
    console.error('[worker/kyc-api]', error);
    return json({ error: 'Internal server error' }, 500);
  }
}
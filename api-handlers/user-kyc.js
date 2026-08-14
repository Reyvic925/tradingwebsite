import supabase from './db-client.js';
import { cors, requireUser as requireUserHelper, getProfileRow } from './helpers.js';
import { insertKycSubmission } from './admin-helpers.js';

// POST /api/user/kyc — submit a KYC application (Binance-standard identity verification)
// GET  /api/user/kyc — list the current user's submissions (newest first)
//
// personal_data shape:
// {
//   first_name, last_name, dob (YYYY-MM-DD, 18+), nationality, country, gender?,
//   address: { street, city, state?, postal_code?, country },
//   document: { type: passport|national_id|drivers_license, number, expiry_date (YYYY-MM-DD, future) }
// }
// documents shape: [{ kind: 'document_front'|'document_back', file_id, name? }]
// where file_id refers to a row the user previously uploaded via /api/kyc-upload.

const DOCUMENT_TYPES = ['passport', 'national_id', 'drivers_license'];

function ageFromDob(dob) {
  const d = new Date(dob);
  if (Number.isNaN(d.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age -= 1;
  return age;
}

export default async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();

  try {
    const user = await requireUserHelper(supabase, req);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    if (req.method === 'POST') {
      const { personal_data = {}, documents = [], metadata = {} } = req.body || {};
      if (!personal_data || typeof personal_data !== 'object') {
        return res.status(400).json({ error: 'personal_data must be provided as JSON' });
      }

      // --- Binance-standard field validation ---
      const first_name = String(personal_data.first_name || '').trim();
      const last_name = String(personal_data.last_name || '').trim();
      const dob = String(personal_data.dob || '').trim();
      const nationality = String(personal_data.nationality || '').trim();
      const country = String(personal_data.country || '').trim();
      const gender = personal_data.gender ? String(personal_data.gender).trim() : '';
      const address = personal_data.address && typeof personal_data.address === 'object' ? personal_data.address : {};
      const document = personal_data.document && typeof personal_data.document === 'object' ? personal_data.document : {};

      if (!first_name || !last_name) return res.status(400).json({ error: 'First name and last name are required' });
      if (!dob || ageFromDob(dob) === null) return res.status(400).json({ error: 'A valid date of birth is required' });
      if (ageFromDob(dob) < 18) return res.status(400).json({ error: 'You must be at least 18 years old to open an account' });
      if (!nationality) return res.status(400).json({ error: 'Nationality is required' });
      if (!country) return res.status(400).json({ error: 'Country of residence is required' });

      const street = String(address.street || '').trim();
      const city = String(address.city || '').trim();
      const addrState = String(address.state || '').trim();
      const postal_code = String(address.postal_code || '').trim();
      const addressCountry = String(address.country || country).trim();
      if (!street) return res.status(400).json({ error: 'Residential street address is required' });
      if (!city) return res.status(400).json({ error: 'City is required' });

      const docType = String(document.type || '').trim();
      const docNumber = String(document.number || '').trim();
      const docExpiry = String(document.expiry_date || '').trim();
      if (!DOCUMENT_TYPES.includes(docType)) {
        return res.status(400).json({ error: `Document type must be one of: ${DOCUMENT_TYPES.join(', ')}` });
      }
      if (!docNumber) return res.status(400).json({ error: 'Document number is required' });
      const expiry = new Date(docExpiry);
      if (!docExpiry || Number.isNaN(expiry.getTime())) return res.status(400).json({ error: 'A valid document expiry date is required' });
      if (expiry.getTime() <= Date.now()) return res.status(400).json({ error: 'Document has expired — provide a document with a future expiry date' });

      // --- Uploaded document files ---
      if (!Array.isArray(documents) || !documents.length) {
        return res.status(400).json({ error: 'Document images are required' });
      }
      const kinds = new Set();
      for (const d of documents) {
        const kind = String(d?.kind || '').trim();
        if (!['document_front', 'document_back'].includes(kind)) {
          return res.status(400).json({ error: `Invalid document kind: ${kind || '(missing)'}` });
        }
        kinds.add(kind);
      }
      if (!kinds.has('document_front')) return res.status(400).json({ error: 'Front side of your document is required' });
      if (docType !== 'passport' && !kinds.has('document_back')) {
        return res.status(400).json({ error: 'Back side is required for national ID and driver’s license' });
      }

      // Verify each file belongs to the submitting user
      const fileIds = documents.map((d) => Number(d.file_id)).filter(Boolean);
      if (fileIds.length !== documents.length) return res.status(400).json({ error: 'Each document entry needs a file_id from an uploaded file' });
      const { data: fileRows, error: fileErr } = await supabase
        .from('kyc_files')
        .select('id, user_id, kind')
        .in('id', fileIds);
      if (fileErr) throw fileErr;
      const byId = new Map((fileRows || []).map((f) => [Number(f.id), f]));
      for (const d of documents) {
        const f = byId.get(Number(d.file_id));
        if (!f) return res.status(400).json({ error: `Uploaded file not found (id ${d.file_id})` });
        if (f.user_id !== user.id) return res.status(403).json({ error: 'Uploaded documents must belong to your account' });
        if (f.kind !== d.kind) return res.status(400).json({ error: `Uploaded file kind mismatch for ${d.kind}` });
      }

      // --- Duplicate / state guards ---
      const profile = await getProfileRow(supabase, user.id).catch(() => null);
      if (profile?.kyc_status === 'verified') {
        return res.status(409).json({ error: 'Your identity is already verified' });
      }
      const { data: pendingRows } = await supabase
        .from('kyc_submissions')
        .select('id')
        .eq('user_id', user.id)
        .eq('status', 'pending')
        .limit(1);
      if ((pendingRows || []).length) {
        return res.status(409).json({ error: 'You already have a KYC application under review' });
      }

      // --- Persist ---
      const clean = {
        first_name,
        last_name,
        full_name: `${first_name} ${last_name}`,
        dob,
        nationality,
        country,
        gender: gender || null,
        address: { street, city, state: addrState || null, postal_code: postal_code || null, country: addressCountry },
        document: { type: docType, number: docNumber, expiry_date: docExpiry },
      };
      const docRefs = documents.map((d) => ({ kind: d.kind, file_id: Number(d.file_id), name: d.name || null }));

      const { data, error } = await insertKycSubmission(user.id, clean, docRefs, metadata);
      if (error) throw error;

      // Move profile into 'pending' and notify the user (both best-effort)
      try {
        if (profile) await supabase.from('profiles').update({ kyc_status: 'pending' }).eq('id', profile.id);
      } catch (e) {
        console.error('[user-kyc] profile update failed', e?.message || e);
      }
      try {
        await supabase.from('notifications').insert({
          user_id: user.id,
          title: 'KYC application submitted',
          body: 'Your identity documents were received and are under review. You will be notified once a decision is made.',
          read: false,
        });
      } catch (e) {
        console.error('[user-kyc] notification failed', e?.message || e);
      }

      return res.status(201).json({ submission: data });
    }

    if (req.method === 'GET') {
      // Return all submissions for the current user
      const { data, error } = await supabase
        .from('kyc_submissions')
        .select('*')
        .eq('user_id', user.id)
        .order('submitted_at', { ascending: false });
      if (error) throw error;
      return res.status(200).json({ submissions: data || [] });
    }

    res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('[user-kyc] error', err?.message || err);
    res.status(500).json({ error: String(err?.message || err) });
  }
}

import supabase from './db-client.js';
import { cors, getProfileRow } from './helpers.js';
import { listKycSubmissions, updateKycSubmission, logAdminAction } from './admin-helpers.js';
import { requireAdmin } from './auth-admin.js';

// Admin endpoints to list and review KYC submissions.
// Admin authentication rules (in order):
// - If user's user_metadata.is_admin is truthy, allow
// - If profile.role === 'admin', allow
// - If request header x-admin-secret matches process.env.ADMIN_SECRET, allow
// Otherwise reject with 403.


export default async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();

  try {
    const adminAuth = await requireAdmin(req);
    if (!adminAuth) return res.status(403).json({ error: 'Forbidden' });
    const adminUser = adminAuth.admin || null;

    if (req.method === 'GET') {
      const { status = null, limit = 200, offset = 0 } = req.query || {};
      const q = { status: status || null, limit: Number(limit || 200), offset: Number(offset || 0) };
      const { data, error } = await listKycSubmissions(q);
      if (error) throw error;
      return res.status(200).json({ submissions: data || [] });
    }

    if (req.method === 'POST') {
      // body: { id, action: 'approve'|'reject', admin_notes }
      const { id, action, admin_notes = '' } = req.body || {};
      if (!id || !action) return res.status(400).json({ error: 'id and action are required' });
      if (!['approve', 'reject'].includes(action)) return res.status(400).json({ error: 'invalid action' });

      // Fetch existing submission
      const { data: existingRows, error: fetchErr } = await supabase.from('kyc_submissions').select('*').eq('id', id).limit(1);
      if (fetchErr) throw fetchErr;
      const existing = (existingRows || [])[0];
      if (!existing) return res.status(404).json({ error: 'Submission not found' });

      const updates = {
        status: action === 'approve' ? 'approved' : 'rejected',
        reviewer_id: adminUser?.id || null,
        reviewed_at: new Date().toISOString(),
        admin_notes: admin_notes || null,
      };

      const { data, error } = await updateKycSubmission(id, updates);
      if (error) throw error;

      // When approved, update profiles table kyc_status/kyc_verified if profile exists
      if (action === 'approve') {
        try {
          const profile = await getProfileRow(supabase, existing.user_id);
          if (profile) {
            const patch = {};
            if (Object.prototype.hasOwnProperty.call(profile, 'kyc_status')) patch.kyc_status = 'verified';
            if (Object.prototype.hasOwnProperty.call(profile, 'kyc_verified')) patch.kyc_verified = true;
            if (Object.keys(patch).length) {
              await supabase.from('profiles').update(patch).eq('id', profile.id);
            }
          }
        } catch (e) {
          // non-fatal; log and continue
          console.error('[admin-kyc] profile update failed', e?.message || e);
        }
      }

      // Log admin action
      try {
        await logAdminAction(adminUser?.id || null, action === 'approve' ? 'kyc.approve' : 'kyc.reject', 'kyc_submission', String(id), { admin_notes });
      } catch (e) {
        console.error('[admin-kyc] logAdminAction failed', e?.message || e);
      }

      return res.status(200).json({ submission: data });
    }

    res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('[admin-kyc] error', err?.message || err);
    res.status(500).json({ error: String(err?.message || err) });
  }
}

import supabase from './db-client.js';
import { cors, requireUser as requireUserHelper } from './helpers.js';
import { insertKycSubmission } from './admin-helpers.js';

// Expected flows for documents:
// - Preferred: frontend uploads files directly to Supabase Storage using the client's anon key
//   (supabase.storage.from(bucket).upload(path, file)) and then passes back the public URL(s) to this endpoint.
// - Alternatively, send document URLs in the `documents` array in the request body.
// This endpoint accepts personal_data (JSON) and documents (array of URLs/objects) and creates a kyc_submissions row.

export default async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(204).end();

  try {
    const user = await requireUserHelper(supabase, req);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    if (req.method === 'POST') {
      const { personal_data = {}, documents = [], metadata = {} } = req.body || {};

      // Basic validation
      if (!personal_data || typeof personal_data !== 'object') {
        return res.status(400).json({ error: 'personal_data must be provided as JSON' });
      }

      const { data, error } = await insertKycSubmission(user.id, personal_data, documents, metadata);
      if (error) {
        throw error;
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

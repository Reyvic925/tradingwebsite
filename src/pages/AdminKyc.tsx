import { useEffect, useState } from 'react';
import AdminShell from '../components/AdminShell';
import { authHeaders } from '../lib/api';

export default function AdminKyc() {
  const [submissions, setSubmissions] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [note, setNote] = useState('');
  const [adminSecret, setAdminSecret] = useState('');
  const [error, setError] = useState('');

  async function fetchList() {
    setLoading(true);
    setError('');
    try {
      const headers = await authHeaders();
      if (adminSecret) headers['x-admin-secret'] = adminSecret;
      const res = await fetch('/api/admin/kyc', { headers });
      const j = await res.json();
      if (!res.ok) throw new Error(j?.error || 'Failed to load KYC submissions');
      setSubmissions(j?.submissions || []);
    } catch (e) {
      console.error(e);
      setError(e instanceof Error ? e.message : 'Failed to load KYC submissions');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchList();
  }, []);

  async function review(id: number, action: 'approve' | 'reject') {
    try {
      const headers = await authHeaders();
      if (adminSecret) headers['x-admin-secret'] = adminSecret;
      headers['Content-Type'] = 'application/json';
      const res = await fetch('/api/admin/kyc', {
        method: 'POST',
        headers,
        body: JSON.stringify({ id, action, admin_notes: note }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j?.error || 'Review failed');
      setNote('');
      fetchList();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Review failed');
    }
  }

  return (
    <AdminShell title="KYC review">
      <div className="mb-5 rounded-md border border-white/10 bg-[#0a0f17] p-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="flex-1">
            <div className="text-[10px] uppercase tracking-[0.2em] text-stone-500">Admin note</div>
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Reason for approval or rejection"
              className="mt-2 w-full rounded-sm border border-white/10 bg-black/30 px-3 py-2 text-sm outline-none focus:border-amber-400/60"
            />
          </div>
          <button onClick={() => fetchList()} disabled={loading} className="rounded-sm bg-amber-400 px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-[#1a1304] disabled:opacity-60">
            {loading ? 'Loading…' : 'Refresh'}
          </button>
        </div>

        <div className="mt-4">
          <div className="text-[10px] uppercase tracking-[0.2em] text-stone-500">Optional admin secret</div>
          <input
            value={adminSecret}
            onChange={(e) => setAdminSecret(e.target.value)}
            placeholder="x-admin-secret override"
            className="mt-2 w-full rounded-sm border border-white/10 bg-black/30 px-3 py-2 text-sm outline-none focus:border-amber-400/60"
          />
        </div>
      </div>

      {error && <div className="mb-4 rounded-sm border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">{error}</div>}

      <div className="overflow-hidden rounded-md border border-white/10 bg-[#0a0f17]">
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-white/[0.02] text-[10px] uppercase tracking-[0.2em] text-stone-500">
              <tr>
                <th className="px-4 py-3 font-medium">ID</th>
                <th className="px-4 py-3 font-medium">User</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Submitted</th>
                <th className="px-4 py-3 font-medium">Personal data</th>
                <th className="px-4 py-3 font-medium">Documents</th>
                <th className="px-4 py-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {submissions.map((s) => (
                <tr key={s.id} className="border-t border-white/10 align-top">
                  <td className="px-4 py-3 text-stone-300">{s.id}</td>
                  <td className="px-4 py-3 font-mono text-xs text-stone-300">{s.user_id}</td>
                  <td className="px-4 py-3 text-stone-200">{s.status}</td>
                  <td className="px-4 py-3 text-stone-400">{s.submitted_at ? new Date(s.submitted_at).toLocaleString() : ''}</td>
                  <td className="px-4 py-3">
                    <pre className="max-w-xs whitespace-pre-wrap font-mono text-[11px] text-amber-200/80">{JSON.stringify(s.personal_data || {}, null, 2)}</pre>
                  </td>
                  <td className="px-4 py-3">
                    {Array.isArray(s.documents) ? s.documents.map((d: any, i: number) => {
                      const url = typeof d === 'string' ? d : d?.url;
                      return url ? (
                        <a key={i} href={url} target="_blank" rel="noreferrer" className="block text-amber-300 hover:text-amber-200">
                          Document #{i + 1}
                        </a>
                      ) : null;
                    }) : <span className="text-stone-500">None</span>}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2">
                      <button onClick={() => review(s.id, 'approve')} className="rounded-sm bg-emerald-500/15 px-3 py-1.5 text-[11px] uppercase tracking-[0.16em] text-emerald-200">
                        Approve
                      </button>
                      <button onClick={() => review(s.id, 'reject')} className="rounded-sm bg-rose-500/15 px-3 py-1.5 text-[11px] uppercase tracking-[0.16em] text-rose-200">
                        Reject
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {!submissions.length && !loading && (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-sm text-stone-500">No KYC submissions yet.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </AdminShell>
  );
}

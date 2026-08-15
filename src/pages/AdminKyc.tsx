import { useEffect, useState } from 'react';
import AdminShell from '../components/AdminShell';
import { authHeaders } from '../lib/api';

type Submission = {
  id: number;
  user_id: number;
  status: 'pending' | 'approved' | 'rejected';
  submitted_at: string;
  personal_data?: {
    first_name: string;
    last_name: string;
    email?: string;
    full_name?: string;
    dob?: string;
    nationality?: string;
    country_of_residence?: string;
    gender?: string;
    address?: { street: string; city: string; state: string; postal_code: string; country: string };
    document?: { type: string; number: string; expiry_date: string };
  };
  documents?: Array<{ kind: string; file_id: number }>;
};

export default function AdminKyc() {
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [loading, setLoading] = useState(false);
  const [adminSecret, setAdminSecret] = useState('');
  const [error, setError] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'approved' | 'rejected'>('pending');
  const [reviewId, setReviewId] = useState<number | null>(null);
  const [reviewNote, setReviewNote] = useState('');
  const [viewDocUrl, setViewDocUrl] = useState<string | null>(null);
  
  async function fetchList() {
    setLoading(true);
    setError('');
    try {
      const headers = await authHeaders();
      if (adminSecret) headers['x-admin-secret'] = adminSecret;
      const statusParam = statusFilter !== 'pending' ? `?status=${statusFilter}` : '';
      const res = await fetch(`/api/admin/kyc${statusParam}`, { headers });
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
  }, [statusFilter]);

  async function review(id: number, action: 'approve' | 'reject') {
    try {
      const headers = await authHeaders();
      if (adminSecret) headers['x-admin-secret'] = adminSecret;
      headers['Content-Type'] = 'application/json';
      const res = await fetch('/api/admin/kyc', {
        method: 'POST',
        headers,
        body: JSON.stringify({ id, action, admin_notes: reviewNote }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j?.error || 'Review failed');
      setReviewNote('');
      setReviewId(null);
      fetchList();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Review failed');
    }
  }

  async function fetchDocumentBlob(fileId: number): Promise<string> {
    const headers = await authHeaders();
    if (adminSecret) headers['x-admin-secret'] = adminSecret;
    const res = await fetch(`/api/kyc-upload?id=${fileId}`, { headers });
    if (!res.ok) throw new Error('Failed to load document');
    const blob = await res.blob();
    return URL.createObjectURL(blob);
  }

  const handleViewDocument = async (fileId: number) => {
    try {
      const url = await fetchDocumentBlob(fileId);
      setViewDocUrl(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load document');
    }
  };

  return (
    <AdminShell title="KYC review">
      {/* Status filter tabs */}
      <div className="mb-4 flex gap-2">
        {(['all', 'pending', 'approved', 'rejected'] as const).map((s) => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={`rounded-sm px-3 py-1.5 text-xs uppercase tracking-widest ${
              statusFilter === s
                ? 'bg-amber-400 text-[#1a1304]'
                : 'border border-white/10 bg-black/30 text-stone-400 hover:border-amber-400/60'
            }`}
          >
            {s}
          </button>
        ))}
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
                  <td className="px-4 py-3">
                    <div className="font-mono text-xs text-stone-300">{s.user_id}</div>
                    {s.personal_data?.email && <div className="text-[10px] text-stone-400">{s.personal_data.email}</div>}
                    {s.personal_data?.full_name && <div className="text-[10px] text-stone-400">{s.personal_data.full_name}</div>}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`rounded px-2 py-0.5 text-[10px] uppercase tracking-widest ${
                      s.status === 'pending' ? 'bg-amber-500/15 text-amber-200' :
                      s.status === 'approved' ? 'bg-emerald-500/15 text-emerald-200' :
                      'bg-rose-500/15 text-rose-200'
                    }`}>{s.status}</span>
                  </td>
                  <td className="px-4 py-3 text-stone-400">{s.submitted_at ? new Date(s.submitted_at).toLocaleString() : ''}</td>
                  <td className="px-4 py-3">
                    <div className="max-w-xs space-y-1 text-[11px] text-stone-300">
                      {s.personal_data?.first_name && <div><span className="text-stone-500">Name:</span> {s.personal_data.first_name} {s.personal_data.last_name}</div>}
                      {s.personal_data?.dob && <div><span className="text-stone-500">DOB:</span> {s.personal_data.dob}</div>}
                      {s.personal_data?.nationality && <div><span className="text-stone-500">Nationality:</span> {s.personal_data.nationality}</div>}
                      {s.personal_data?.address && (
                        <div><span className="text-stone-500">Address:</span> {s.personal_data.address.street}, {s.personal_data.address.city}, {s.personal_data.address.postal_code}</div>
                      )}
                      {s.personal_data?.document && (
                        <div><span className="text-stone-500">Document:</span> {s.personal_data.document.type} ({s.personal_data.document.number})</div>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-col gap-2">
                      {Array.isArray(s.documents) && s.documents.length > 0 ? s.documents.map((d, i) => {
                        const label = d.kind === 'document_front' ? 'Front' : d.kind === 'document_back' ? 'Back' : `Doc #${i + 1}`;
                        return (
                          <button
                            key={i}
                            onClick={() => handleViewDocument(d.file_id)}
                            className="text-left text-amber-300 hover:text-amber-200 hover:underline"
                          >
                            {label}
                          </button>
                        );
                      }) : <span className="text-stone-500">None</span>}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2">
                      <button
                        onClick={() => { setReviewId(s.id); setReviewNote(''); }}
                        className="rounded-sm bg-emerald-500/15 px-3 py-1.5 text-[11px] uppercase tracking-[0.16em] text-emerald-200 hover:bg-emerald-500/25"
                      >
                        Approve
                      </button>
                      <button
                        onClick={() => { setReviewId(s.id); setReviewNote(''); }}
                        className="rounded-sm bg-rose-500/15 px-3 py-1.5 text-[11px] uppercase tracking-[0.16em] text-rose-200 hover:bg-rose-500/25"
                      >
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

      {/* Review modal */}
      {reviewId !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
          <div className="w-full max-w-md rounded-md border border-white/10 bg-[#0a0f17] p-5">
            <h3 className="text-lg font-semibold text-white">
              {(() => {
                const sub = submissions.find(s => s.id === reviewId);
                return sub ? `Review KYC #${reviewId} (${sub.status})` : `Review KYC #${reviewId}`;
              })()}
            </h3>
            <p className="mt-2 text-sm text-stone-400">Enter a note and confirm your decision:</p>
            <textarea
              value={reviewNote}
              onChange={(e) => setReviewNote(e.target.value)}
              placeholder="Optional administrative note"
              className="mt-3 h-28 w-full rounded-sm border border-white/10 bg-black/30 px-3 py-2 text-sm outline-none focus:border-amber-400/60"
            />
            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => { setReviewId(null); setReviewNote(''); }}
                className="rounded-sm border border-white/10 bg-black/30 px-4 py-2 text-sm text-stone-300 hover:border-amber-400/60"
              >
                Cancel
              </button>
              <button
                onClick={() => review(reviewId, 'approve')}
                className="rounded-sm bg-emerald-500/15 px-4 py-2 text-sm uppercase tracking-widest text-emerald-200 hover:bg-emerald-500/25"
              >
                Approve
              </button>
              <button
                onClick={() => review(reviewId, 'reject')}
                className="rounded-sm bg-rose-500/15 px-4 py-2 text-sm uppercase tracking-widest text-rose-200 hover:bg-rose-500/25"
              >
                Reject
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Document viewer modal */}
      {viewDocUrl && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90" onClick={() => setViewDocUrl(null)}>
          <div className="relative max-h-[90vh] max-w-[90vw]" onClick={(e) => e.stopPropagation()}>
            <img src={viewDocUrl} alt="Document" className="max-h-[90vh] max-w-[90vw] object-contain" />
            <button
              onClick={() => setViewDocUrl(null)}
              className="absolute -right-4 -top-4 rounded-full bg-black/70 px-3 py-1.5 text-sm text-white hover:bg-black/90"
            >
              ✕
            </button>
          </div>
        </div>
      )}
    </AdminShell>
  );
}

import { useEffect, useMemo, useState } from 'react';
import AdminShell from '../../components/AdminShell';
import { authHeaders } from '../../lib/api';

async function readJsonOrText(res: Response) {
  const text = await res.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(text || `Request failed (${res.status})`);
  }
}

type RoiApproval = {
  id: number;
  user_id: string;
  user_email?: string | null;
  user_name?: string | null;
  amount: number;
  currency?: string | null;
  status: 'pending' | 'approved' | 'rejected';
  type?: string | null;
  created_at: string;
  approved_at?: string | null;
  investment_id?: number | null;
  investment?: {
    id: number;
    plan_name?: string | null;
    amount?: number | null;
    current_value?: number | null;
    status?: string | null;
  } | null;
};

export default function ROIApprovals() {
  const [items, setItems] = useState<RoiApproval[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<'all' | 'pending' | 'approved' | 'rejected'>('pending');
  const [reviewId, setReviewId] = useState<number | null>(null);
  const [reviewNote, setReviewNote] = useState('');

  async function fetchList() {
    setLoading(true);
    setError('');
    try {
      const headers = await authHeaders();
      const endpoint = filter === 'all' ? '/api/admin/roi-approvals?status=all' : `/api/admin/roi-approvals?status=${filter}`;
      const res = await fetch(endpoint, { headers });
      const data = await readJsonOrText(res);
      if (!res.ok) throw new Error(data?.error || 'Failed to load ROI approvals');
      setItems((data?.withdrawals || []) as RoiApproval[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load ROI approvals');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void fetchList();
  }, [filter]);

  const counts = useMemo(() => ({
    pending: items.filter((w) => w.status === 'pending').length,
    approved: items.filter((w) => w.status === 'approved').length,
    rejected: items.filter((w) => w.status === 'rejected').length,
  }), [items]);

  async function act(id: number, action: 'approve' | 'reject') {
    try {
      const headers = await authHeaders();
      headers['Content-Type'] = 'application/json';
      const res = await fetch('/api/admin/roi-approvals', {
        method: 'POST',
        headers,
        body: JSON.stringify({ id, action, admin_notes: reviewNote }),
      });
      const data = await readJsonOrText(res);
      if (!res.ok) throw new Error(data?.error || 'Review failed');
      setReviewId(null);
      setReviewNote('');
      void fetchList();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Review failed');
    }
  }

  return (
    <AdminShell title="ROI approvals">
      <div className="mb-4 flex flex-wrap gap-2">
        {(['all', 'pending', 'approved', 'rejected'] as const).map((s) => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            className={`rounded-sm px-3 py-1.5 text-xs uppercase tracking-widest ${
              filter === s ? 'bg-amber-400 text-[#1a1304]' : 'border border-white/10 bg-black/30 text-stone-400 hover:border-amber-400/60'
            }`}
          >
            {s} {s !== 'all' ? `(${counts[s]})` : ''}
          </button>
        ))}
      </div>

      {error && <div className="mb-4 rounded-sm border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">{error}</div>}

      <div className="overflow-hidden rounded-md border border-white/10 bg-[#0a0f17]">
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-white/[0.02] text-[10px] uppercase tracking-[0.2em] text-stone-500">
              <tr>
                <th className="px-4 py-3">ID</th>
                <th className="px-4 py-3">User</th>
                <th className="px-4 py-3">Investment</th>
                <th className="px-4 py-3">Amount</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Created</th>
                <th className="px-4 py-3">Action</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id} className="border-t border-white/10 align-top">
                  <td className="px-4 py-3 text-stone-300">{item.id}</td>
                  <td className="px-4 py-3">
                    <div className="font-mono text-xs text-stone-300">{item.user_id}</div>
                    {item.user_email && <div className="text-[10px] text-stone-400">{item.user_email}</div>}
                    {item.user_name && <div className="text-[10px] text-stone-400">{item.user_name}</div>}
                  </td>
                  <td className="px-4 py-3">
                    <div className="font-medium text-stone-200">{item.investment?.plan_name || 'Investment'}</div>
                    <div className="text-[10px] text-stone-400">#{item.investment_id || item.investment?.id || '—'}</div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="font-semibold text-amber-200">{Number(item.amount || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}</div>
                    <div className="text-[10px] uppercase tracking-[0.2em] text-stone-400">{item.currency || 'USD'}</div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`rounded px-2 py-0.5 text-[10px] uppercase tracking-widest ${
                      item.status === 'pending' ? 'bg-amber-500/15 text-amber-200' :
                      item.status === 'approved' ? 'bg-emerald-500/15 text-emerald-200' :
                      'bg-rose-500/15 text-rose-200'
                    }`}>{item.status}</span>
                  </td>
                  <td className="px-4 py-3 text-[11px] text-stone-300">{new Date(item.created_at).toLocaleString()}</td>
                  <td className="px-4 py-3">
                    {item.status === 'pending' ? (
                      <button
                        onClick={() => setReviewId(item.id)}
                        className="rounded-sm bg-amber-500/15 px-3 py-1.5 text-[11px] uppercase tracking-[0.16em] text-amber-200 hover:bg-amber-500/20"
                      >
                        Review
                      </button>
                    ) : (
                      <span className="text-[10px] uppercase tracking-[0.2em] text-stone-500">Closed</span>
                    )}
                  </td>
                </tr>
              ))}
              {!items.length && !loading && (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-sm text-stone-500">No ROI approvals found.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {reviewId !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
          <div className="w-full max-w-md rounded-md border border-white/10 bg-[#0a0f17] p-5">
            <h3 className="text-lg font-semibold text-white">Review ROI request</h3>
            <p className="mt-2 text-sm text-stone-400">Approve or reject this locked-balance withdrawal.</p>
            <textarea
              value={reviewNote}
              onChange={(e) => setReviewNote(e.target.value)}
              placeholder="Optional admin note"
              className="mt-4 h-28 w-full rounded-sm border border-white/10 bg-black/30 px-3 py-2 text-sm text-stone-200 outline-none focus:border-amber-400/60"
            />
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => { setReviewId(null); setReviewNote(''); }} className="rounded-sm border border-white/10 px-3 py-2 text-xs uppercase tracking-[0.18em] text-stone-300">Cancel</button>
              <button onClick={() => void act(reviewId, 'reject')} className="rounded-sm bg-rose-500/15 px-3 py-2 text-xs uppercase tracking-[0.18em] text-rose-200">Reject</button>
              <button onClick={() => void act(reviewId, 'approve')} className="rounded-sm bg-emerald-500/15 px-3 py-2 text-xs uppercase tracking-[0.18em] text-emerald-200">Approve</button>
            </div>
          </div>
        </div>
      )}
    </AdminShell>
  );
}

import { useEffect, useMemo, useState } from 'react';
import AdminShell from '../components/AdminShell';
import { authHeaders } from '../lib/api';

async function readJsonOrText(res: Response) {
  const text = await res.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(text || `Request failed (${res.status})`);
  }
}

type Withdrawal = {
  id: number;
  user_id: string;
  user_email?: string | null;
  user_name?: string | null;
  wallet_balance?: number;
  wallet_currency?: string | null;
  amount: number;
  currency: string;
  status: 'pending' | 'approved' | 'rejected';
  external_address?: string | null;
  created_at: string;
  admin_notes?: string | null;
  reviewed_at?: string | null;
  reviewed_by?: string | null;
};

export default function AdminWithdrawals() {
  const [withdrawals, setWithdrawals] = useState<Withdrawal[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'approved' | 'rejected'>('pending');
  const [reviewId, setReviewId] = useState<number | null>(null);
  const [reviewNote, setReviewNote] = useState('');

  async function fetchList() {
    setLoading(true);
    setError('');
    try {
      const headers = await authHeaders();
      const statusParam = statusFilter === 'all' ? '?status=all' : `?status=${statusFilter}`;
      const res = await fetch(`/api/admin/withdrawals${statusParam}`, { headers });
      const data = await readJsonOrText(res);
      if (!res.ok) throw new Error(data?.error || 'Failed to load withdrawals');
      setWithdrawals((data?.withdrawals || []) as Withdrawal[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load withdrawals');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchList();
  }, [statusFilter]);

  const counts = useMemo(() => ({
    pending: withdrawals.filter((w) => w.status === 'pending').length,
    approved: withdrawals.filter((w) => w.status === 'approved').length,
    rejected: withdrawals.filter((w) => w.status === 'rejected').length,
  }), [withdrawals]);

  async function review(id: number, action: 'approve' | 'reject') {
    try {
      const headers = await authHeaders();
      headers['Content-Type'] = 'application/json';
      const res = await fetch('/api/admin/withdrawals', {
        method: 'POST',
        headers,
        body: JSON.stringify({ id, action, admin_notes: reviewNote }),
      });
      const data = await readJsonOrText(res);
      if (!res.ok) throw new Error(data?.error || 'Review failed');
      setReviewId(null);
      setReviewNote('');
      fetchList();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Review failed');
    }
  }

  return (
    <AdminShell title="Withdrawal review">
      <div className="mb-4 flex flex-wrap gap-2">
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
                <th className="px-4 py-3 font-medium">ID</th>
                <th className="px-4 py-3 font-medium">User</th>
                <th className="px-4 py-3 font-medium">Balance</th>
                <th className="px-4 py-3 font-medium">Amount</th>
                <th className="px-4 py-3 font-medium">Destination</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Audit</th>
                <th className="px-4 py-3 font-medium">Action</th>
              </tr>
            </thead>
            <tbody>
              {withdrawals.map((w) => (
                <tr key={w.id} className="border-t border-white/10 align-top">
                  <td className="px-4 py-3 text-stone-300">{w.id}</td>
                  <td className="px-4 py-3">
                    <div className="font-mono text-xs text-stone-300">{w.user_id}</div>
                    {w.user_email && <div className="text-[10px] text-stone-400">{w.user_email}</div>}
                    {w.user_name && <div className="text-[10px] text-stone-400">{w.user_name}</div>}
                  </td>
                  <td className="px-4 py-3">
                    <div className="font-semibold text-emerald-200">{Number(w.wallet_balance || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })}</div>
                    <div className="text-[10px] uppercase tracking-[0.2em] text-stone-400">{w.wallet_currency || w.currency}</div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="font-semibold text-amber-200">{Number(w.amount).toLocaleString(undefined, { maximumFractionDigits: 2 })}</div>
                    <div className="text-[10px] uppercase tracking-[0.2em] text-stone-400">{w.currency}</div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="max-w-xs break-all font-mono text-[11px] text-stone-300">{w.external_address || '—'}</div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`rounded px-2 py-0.5 text-[10px] uppercase tracking-widest ${
                      w.status === 'pending' ? 'bg-amber-500/15 text-amber-200' :
                      w.status === 'approved' ? 'bg-emerald-500/15 text-emerald-200' :
                      'bg-rose-500/15 text-rose-200'
                    }`}>{w.status}</span>
                  </td>
                  <td className="px-4 py-3 text-[11px] text-stone-300">
                    {w.reviewed_at ? (
                      <div>
                        <div>{new Date(w.reviewed_at).toLocaleString()}</div>
                        {w.admin_notes && <div className="mt-1 max-w-xs text-stone-400">{w.admin_notes}</div>}
                      </div>
                    ) : (
                      <div className="text-stone-500">Pending review</div>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {w.status === 'pending' ? (
                      <button
                        onClick={() => setReviewId(w.id)}
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
              {!withdrawals.length && !loading && (
                <tr>
                  <td colSpan={8} className="px-4 py-10 text-center text-sm text-stone-500">No withdrawals found.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {reviewId !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
          <div className="w-full max-w-md rounded-md border border-white/10 bg-[#0a0f17] p-5">
            <h3 className="text-lg font-semibold text-white">Review withdrawal</h3>
            <p className="mt-2 text-sm text-stone-400">Approve or reject this withdrawal request.</p>
            <textarea
              value={reviewNote}
              onChange={(e) => setReviewNote(e.target.value)}
              placeholder="Optional admin note"
              className="mt-4 h-28 w-full rounded-sm border border-white/10 bg-black/30 px-3 py-2 text-sm text-stone-200 outline-none focus:border-amber-400/60"
            />
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => { setReviewId(null); setReviewNote(''); }} className="rounded-sm border border-white/10 px-3 py-2 text-xs uppercase tracking-[0.18em] text-stone-300">Cancel</button>
              <button onClick={() => review(reviewId, 'reject')} className="rounded-sm bg-rose-500/15 px-3 py-2 text-xs uppercase tracking-[0.18em] text-rose-200">Reject</button>
              <button onClick={() => review(reviewId, 'approve')} className="rounded-sm bg-emerald-500/15 px-3 py-2 text-xs uppercase tracking-[0.18em] text-emerald-200">Approve</button>
            </div>
          </div>
        </div>
      )}
    </AdminShell>
  );
}

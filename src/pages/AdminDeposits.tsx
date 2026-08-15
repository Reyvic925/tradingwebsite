import { useEffect, useState } from 'react';
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

type Deposit = {
  id: number;
  user_id: string;
  user_email?: string | null;
  user_name?: string | null;
  amount: number;
  currency: string;
  method: string;
  status: 'pending' | 'confirmed' | 'rejected';
  created_at: string;
  confirmed_at?: string | null;
  admin_notes?: string | null;
};

export default function AdminDeposits() {
  const [deposits, setDeposits] = useState<Deposit[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<'all' | 'pending' | 'confirmed'>('pending');
  const [reviewId, setReviewId] = useState<number | null>(null);
  const [reviewNote, setReviewNote] = useState('');
  const [creditedAmount, setCreditedAmount] = useState<string>('');

  async function fetchList() {
    setLoading(true);
    setError('');
    try {
      const headers = await authHeaders();
      const statusParam = filter === 'all' ? '?status=all' : `?status=${filter}`;
      const res = await fetch(`/api/admin/deposits${statusParam}`, { headers });
      const data = await readJsonOrText(res);
      if (!res.ok) throw new Error(data?.error || 'Failed to load deposits');
      setDeposits((data?.deposits || []) as Deposit[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load deposits');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchList();
  }, [filter]);

  async function approve(id: number) {
    try {
      const headers = await authHeaders();
      headers['Content-Type'] = 'application/json';
      const res = await fetch('/api/admin/deposits', {
        method: 'POST',
        headers,
        body: JSON.stringify({ depositId: id, admin_notes: reviewNote, credited_amount: Number(creditedAmount || 0) }),
      });
      const data = await readJsonOrText(res);
      if (!res.ok) throw new Error(data?.error || 'Approval failed');
      setReviewId(null);
      setReviewNote('');
      setCreditedAmount('');
      fetchList();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Approval failed');
    }
  }

  return (
    <AdminShell title="Deposit approvals">
      <div className="mb-4 flex gap-2">
        {(['all', 'pending', 'confirmed'] as const).map((s) => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            className={`rounded-sm px-3 py-1.5 text-xs uppercase tracking-widest ${
              filter === s
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
                <th className="px-4 py-3 font-medium">Amount</th>
                <th className="px-4 py-3 font-medium">Method</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Created</th>
                <th className="px-4 py-3 font-medium">Action</th>
              </tr>
            </thead>
            <tbody>
              {deposits.map((d) => (
                <tr key={d.id} className="border-t border-white/10 align-top">
                  <td className="px-4 py-3 text-stone-300">{d.id}</td>
                  <td className="px-4 py-3">
                    <div className="font-mono text-xs text-stone-300">{d.user_id}</div>
                    {d.user_email && <div className="text-[10px] text-stone-400">{d.user_email}</div>}
                    {d.user_name && <div className="text-[10px] text-stone-400">{d.user_name}</div>}
                  </td>
                  <td className="px-4 py-3">
                    <div className="font-semibold text-emerald-200">{Number(d.amount).toLocaleString(undefined, { maximumFractionDigits: 2 })}</div>
                    <div className="text-[10px] uppercase tracking-[0.2em] text-stone-400">{d.currency}</div>
                  </td>
                  <td className="px-4 py-3 text-stone-300">{d.method}</td>
                  <td className="px-4 py-3">
                    <span className={`rounded px-2 py-0.5 text-[10px] uppercase tracking-widest ${
                      d.status === 'pending' ? 'bg-amber-500/15 text-amber-200' : 'bg-emerald-500/15 text-emerald-200'
                    }`}>{d.status}</span>
                  </td>
                  <td className="px-4 py-3 text-stone-400">{new Date(d.created_at).toLocaleString()}</td>
                  <td className="px-4 py-3">
                    {d.status === 'pending' ? (
                      <button
                        onClick={() => {
                          setReviewId(d.id);
                          setCreditedAmount(String(d.amount));
                          setReviewNote('');
                        }}
                        className="rounded-sm bg-emerald-500/15 px-3 py-1.5 text-[11px] uppercase tracking-[0.16em] text-emerald-200 hover:bg-emerald-500/20"
                      >
                        Approve
                      </button>
                    ) : (
                      <span className="text-[10px] uppercase tracking-[0.2em] text-stone-500">Closed</span>
                    )}
                  </td>
                </tr>
              ))}
              {!deposits.length && !loading && (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-sm text-stone-500">No deposit requests found.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {reviewId !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
          <div className="w-full max-w-md rounded-md border border-white/10 bg-[#0a0f17] p-5">
            <h3 className="text-lg font-semibold text-white">Approve deposit</h3>
            <p className="mt-2 text-sm text-stone-400">Enter the amount verified on-chain, then credit the user’s wallet balance.</p>
            <label className="mt-4 block text-[10px] uppercase tracking-[0.18em] text-stone-500">Amount to credit</label>
            <input
              value={creditedAmount}
              onChange={(e) => setCreditedAmount(e.target.value)}
              type="number"
              min="0"
              step="0.01"
              className="mt-2 w-full rounded-sm border border-white/10 bg-black/30 px-3 py-2 text-sm text-stone-200 outline-none focus:border-amber-400/60"
            />
            <textarea
              value={reviewNote}
              onChange={(e) => setReviewNote(e.target.value)}
              placeholder="Optional admin note"
              className="mt-4 h-24 w-full rounded-sm border border-white/10 bg-black/30 px-3 py-2 text-sm text-stone-200 outline-none focus:border-amber-400/60"
            />
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => { setReviewId(null); setReviewNote(''); setCreditedAmount(''); }} className="rounded-sm border border-white/10 px-3 py-2 text-xs uppercase tracking-[0.18em] text-stone-300">Cancel</button>
              <button onClick={() => approve(reviewId)} className="rounded-sm bg-emerald-500/15 px-3 py-2 text-xs uppercase tracking-[0.18em] text-emerald-200">Approve</button>
            </div>
          </div>
        </div>
      )}
    </AdminShell>
  );
}

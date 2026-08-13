import { useEffect, useState } from 'react';
import AppShell from '../components/AppShell';
import { apiGet } from '../lib/api';
import { formatMoney } from '../lib/format';

type RefData = {
  code: string;
  referrals: { id: number; referred_email: string; bonus: number; status: string; created_at?: string }[];
  total_bonus: number;
  count: number;
};

export default function Referrals() {
  const [data, setData] = useState<RefData | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiGet<RefData>('/api/referrals')
      .then((d) => setData({
        ...d,
        referrals: Array.isArray(d?.referrals) ? d.referrals : [],
        code: d?.code || '',
        total_bonus: Number(d?.total_bonus || 0),
        count: Number(d?.count || 0),
      }))
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load referrals'))
      .finally(() => setLoading(false));
  }, []);

  const link = typeof window !== 'undefined' ? `${window.location.origin}/login?mode=signup&ref=${data?.code || ''}` : '';

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  };

  return (
    <AppShell>
      <div className="text-[11px] uppercase tracking-[0.24em] text-amber-300/70">Network</div>
      <h1 className="font-display text-4xl">Referral program</h1>
      <p className="mt-2 max-w-xl text-sm text-stone-400">Invite a client. When they open an account, you receive a $25 credit. They start with a $1,000 welcome balance.</p>
      {loading && <div className="mt-8 h-28 animate-pulse rounded-md bg-white/5" />}
      {error && <div className="mt-4 text-sm text-rose-300">{error}</div>}

      <div className="mt-8 grid gap-4 md:grid-cols-3">
        <div className="rounded-md border border-white/5 p-5">
          <div className="text-[10px] uppercase tracking-widest text-stone-500">Your code</div>
          <div className="mt-2 font-mono text-2xl text-amber-200">{data?.code || '—'}</div>
        </div>
        <div className="rounded-md border border-white/5 p-5">
          <div className="text-[10px] uppercase tracking-widest text-stone-500">Invites</div>
          <div className="mt-2 font-display text-3xl">{data?.count ?? 0}</div>
        </div>
        <div className="rounded-md border border-white/5 p-5">
          <div className="text-[10px] uppercase tracking-widest text-stone-500">Bonus earned</div>
          <div className="mt-2 font-display text-3xl text-emerald-400">{formatMoney(Number(data?.total_bonus || 0))}</div>
        </div>
      </div>

      <div className="mt-6 flex flex-col gap-2 rounded-md border border-white/5 p-4 sm:flex-row">
        <input readOnly value={link} className="flex-1 rounded-sm border border-white/10 bg-black/40 px-3 py-2 text-sm" />
        <button onClick={copy} className="rounded-sm bg-amber-400 px-4 py-2 text-xs font-semibold uppercase tracking-widest text-[#1a1304]">
          {copied ? 'Copied' : 'Copy link'}
        </button>
      </div>

      <div className="mt-8 overflow-hidden rounded-md border border-white/5">
        <table className="w-full text-left text-sm">
          <thead className="text-[10px] uppercase tracking-widest text-stone-500">
            <tr>
              <th className="px-5 py-3">Client</th>
              <th className="px-3 py-3">Bonus</th>
              <th className="px-5 py-3">Status</th>
            </tr>
          </thead>
          <tbody>
            {(data?.referrals || []).map((r) => (
              <tr key={r.id} className="border-t border-white/5">
                <td className="px-5 py-3">{r.referred_email}</td>
                <td className="px-3 py-3 font-mono text-emerald-400">{formatMoney(Number(r.bonus))}</td>
                <td className="px-5 py-3 capitalize">{r.status}</td>
              </tr>
            ))}
            {!data?.referrals?.length && (
              <tr><td colSpan={3} className="px-5 py-8 text-center text-stone-500">No referrals yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </AppShell>
  );
}

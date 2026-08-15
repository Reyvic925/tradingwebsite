import { useEffect, useMemo, useState } from 'react';
import { ArrowRight, FileText, ShieldCheck, Wallet, Search } from 'lucide-react';
import AdminShell from '../components/AdminShell';
import { authHeaders } from '../lib/api';

type UserRow = {
  id: number | null;
  user_id: string | null;
  email: string | null;
  full_name: string | null;
  role: string;
  kyc_status: string;
  created_at: string | null;
  wallet_count: number;
  kyc_count: number;
  has_mnemonic: boolean;
  latest_kyc_submission_id: number | null;
  latest_kyc_submitted_at: string | null;
  latest_kyc_status: string | null;
};

export default function AdminUsers() {
  const [rows, setRows] = useState<UserRow[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [selectedUser, setSelectedUser] = useState<UserRow | null>(null);
  const [kycDocs, setKycDocs] = useState<any[]>([]);
  const [wallets, setWallets] = useState<any[]>([]);

  async function fetchUsers() {
    setLoading(true);
    setError('');
    try {
      const headers = await authHeaders();
      const qs = new URLSearchParams();
      if (search.trim()) qs.set('search', search.trim());
      const res = await fetch(`/api/admin/users${qs.toString() ? `?${qs}` : ''}`, { headers });
      const j = await res.json();
      if (!res.ok) throw new Error(j?.error || 'Failed to load users');
      setRows(j?.users || []);
      if (selectedUserId) {
        const match = (j?.users || []).find((u: UserRow) => u.user_id === selectedUserId) || null;
        setSelectedUser(match);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load users');
    } finally {
      setLoading(false);
    }
  }

  async function loadUserDetails(userId: string) {
    setSelectedUserId(userId);
    const row = rows.find((r) => r.user_id === userId) || null;
    setSelectedUser(row);

    try {
      const headers = await authHeaders();
      const [kycRes, walletsRes] = await Promise.all([
        fetch(`/api/admin/users/${userId}/kyc`, { headers }),
        fetch(`/api/wallets/admin/${userId}`, { headers }),
      ]);
      const kycData = await kycRes.json();
      const walletData = await walletsRes.json();
      if (!kycRes.ok) throw new Error(kycData?.error || 'Failed to load KYC details');
      if (!walletsRes.ok) throw new Error(walletData?.error || 'Failed to load wallet details');
      setKycDocs(kycData?.documents || []);
      const flatWallets = Object.entries(walletData?.wallets || {}).map(([key, value]: any) => ({
        variant: key,
        currency: value?.currency || key,
        network: value?.network || '—',
        address: value?.address || '—',
        hasPrivateKey: Boolean(value?.privateKey),
        hasMnemonic: Boolean(value?.mnemonic),
      }));
      setWallets(flatWallets);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load user details');
      setKycDocs([]);
      setWallets([]);
    }
  }

  useEffect(() => {
    fetchUsers();
  }, [search]);

  const totalWallets = useMemo(() => rows.reduce((sum, row) => sum + (row.wallet_count || 0), 0), [rows]);

  return (
    <AdminShell title="All users">
      <div className="mb-4 rounded-md border border-white/10 bg-[#0a0f17] p-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="relative max-w-md flex-1">
            <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-stone-500" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by email, name, or user id"
              className="w-full rounded-sm border border-white/10 bg-black/30 py-2 pl-9 pr-3 text-sm outline-none focus:border-amber-400/60"
            />
          </div>
          <button onClick={() => fetchUsers()} disabled={loading} className="rounded-sm bg-amber-400 px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-[#1a1304] disabled:opacity-60">
            {loading ? 'Loading…' : 'Refresh'}
          </button>
        </div>
      </div>

      {error && <div className="mb-4 rounded-sm border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">{error}</div>}

      <div className="mb-6 grid gap-4 md:grid-cols-3">
        <StatCard label="Users" value={String(rows.length)} icon={ShieldCheck} />
        <StatCard label="Wallets" value={String(totalWallets)} icon={Wallet} />
        <StatCard label="KYC reviewed" value={String(rows.filter((u) => u.kyc_count > 0).length)} icon={FileText} />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.4fr_0.9fr]">
        <div className="overflow-hidden rounded-md border border-white/10 bg-[#0a0f17]">
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-white/[0.02] text-[10px] uppercase tracking-[0.2em] text-stone-500">
                <tr>
                  <th className="px-4 py-3 font-medium">User</th>
                  <th className="px-4 py-3 font-medium">KYC</th>
                  <th className="px-4 py-3 font-medium">Wallets</th>
                  <th className="px-4 py-3 font-medium">Mnemonic</th>
                  <th className="px-4 py-3 font-medium">Action</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.user_id ?? row.id ?? 'row'} className={`border-t border-white/10 ${selectedUserId === row.user_id ? 'bg-amber-400/5' : ''}`}>
                    <td className="px-4 py-3">
                      <div className="font-mono text-xs text-stone-200">{row.user_id || '—'}</div>
                      <div className="text-xs text-stone-400">{row.email || row.full_name || 'No profile data'}</div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`rounded px-2 py-0.5 text-[10px] uppercase tracking-widest ${
                        row.kyc_status === 'approved' ? 'bg-emerald-500/15 text-emerald-200' :
                        row.kyc_status === 'rejected' ? 'bg-rose-500/15 text-rose-200' :
                        'bg-amber-500/15 text-amber-200'
                      }`}>{row.kyc_status}</span>
                    </td>
                    <td className="px-4 py-3 text-stone-300">{row.wallet_count}</td>
                    <td className="px-4 py-3 text-stone-300">{row.has_mnemonic ? 'Yes' : 'No'}</td>
                    <td className="px-4 py-3">
                      <button onClick={() => row.user_id && loadUserDetails(row.user_id)} className="inline-flex items-center gap-2 rounded-sm border border-amber-400/40 bg-amber-400/10 px-3 py-1.5 text-[11px] uppercase tracking-[0.16em] text-amber-200">
                        View <ArrowRight size={12} />
                      </button>
                    </td>
                  </tr>
                ))}
                {!rows.length && !loading && (
                  <tr>
                    <td colSpan={5} className="px-4 py-10 text-center text-sm text-stone-500">No users match this filter.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <aside className="rounded-md border border-white/10 bg-[#0a0f17] p-4">
          {!selectedUser ? (
            <div className="text-sm text-stone-400">Select a user to inspect profile, KYC, and crypto keys.</div>
          ) : (
            <div className="space-y-5">
              <div>
                <div className="text-[10px] uppercase tracking-[0.2em] text-stone-500">Profile</div>
                <div className="mt-2 font-display text-2xl">{selectedUser.full_name || selectedUser.email || 'Unnamed user'}</div>
                <div className="mt-1 font-mono text-xs text-stone-300">{selectedUser.user_id}</div>
                {selectedUser.email && <div className="mt-1 text-sm text-stone-400">{selectedUser.email}</div>}
              </div>

              <div className="space-y-2 text-sm text-stone-300">
                <div><span className="text-stone-500">Role:</span> {selectedUser.role}</div>
                <div><span className="text-stone-500">KYC status:</span> {selectedUser.kyc_status}</div>
                <div><span className="text-stone-500">Wallets:</span> {selectedUser.wallet_count}</div>
                <div><span className="text-stone-500">Mnemonic:</span> {selectedUser.has_mnemonic ? 'Stored encrypted' : 'Missing'}</div>
                <div><span className="text-stone-500">Created:</span> {selectedUser.created_at ? new Date(selectedUser.created_at).toLocaleString() : '—'}</div>
              </div>

              <div>
                <div className="mb-2 text-[10px] uppercase tracking-[0.2em] text-stone-500">KYC submissions</div>
                {kycDocs.length ? (
                  <ul className="space-y-2 text-sm text-stone-300">
                    {kycDocs.map((doc: any, idx: number) => (
                      <li key={idx} className="rounded-sm border border-white/10 bg-black/20 p-2">
                        <div className="font-medium text-amber-200">{doc.status || 'unknown'}</div>
                        <div className="text-xs text-stone-400">Submitted: {doc.submitted_at ? new Date(doc.submitted_at).toLocaleString() : '—'}</div>
                        {doc.documents?.length ? <div className="mt-2 text-xs text-stone-400">Documents: {doc.documents.length}</div> : null}
                      </li>
                    ))}
                  </ul>
                ) : <div className="text-sm text-stone-400">No KYC records for this user.</div>}
              </div>

              <div>
                <div className="mb-2 text-[10px] uppercase tracking-[0.2em] text-stone-500">Crypto addresses</div>
                {wallets.length ? (
                  <ul className="space-y-2 text-sm text-stone-300">
                    {wallets.map((wallet) => (
                      <li key={wallet.variant} className="rounded-sm border border-white/10 bg-black/20 p-2">
                        <div className="font-medium text-amber-200">{wallet.currency} / {wallet.variant}</div>
                        <div className="font-mono text-[11px] text-stone-300 break-all">{wallet.address}</div>
                        <div className="mt-1 text-[10px] text-stone-400">Network: {wallet.network} • Private key: {wallet.hasPrivateKey ? 'present' : 'redacted'} • Mnemonic: {wallet.hasMnemonic ? 'present' : 'redacted'}</div>
                      </li>
                    ))}
                  </ul>
                ) : <div className="text-sm text-stone-400">No crypto addresses for this user.</div>}
              </div>
            </div>
          )}
        </aside>
      </div>
    </AdminShell>
  );
}

function StatCard({ label, value, icon: Icon }: { label: string; value: string; icon: typeof ShieldCheck }) {
  return (
    <div className="rounded-md border border-white/10 bg-[#0a0f17] p-4">
      <div className="flex items-center justify-between">
        <div className="text-[10px] uppercase tracking-[0.2em] text-stone-500">{label}</div>
        <Icon size={16} className="text-amber-200" />
      </div>
      <div className="mt-3 font-display text-3xl">{value}</div>
    </div>
  );
}

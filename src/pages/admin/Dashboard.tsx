import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight, ShieldCheck, Wallet, FileText, Activity, DatabaseZap } from 'lucide-react';
import AdminShell from '../../components/AdminShell';
import { apiSend } from '../../lib/api';

export default function AdminDashboard() {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const handleSeedMarkets = async () => {
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const res = await apiSend<{ ok: boolean; count?: number }>('/api/admin/seed-markets', 'POST');
      setMessage(`Seeded markets successfully. Total markets: ${res?.count ?? 'unknown'}.`);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to seed markets');
    } finally {
      setBusy(false);
    }
  };

  return (
    <AdminShell title="Admin dashboard">
      {message && <div className="mb-4 rounded-sm border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-200">{message}</div>}
      {error && <div className="mb-4 rounded-sm border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">{error}</div>}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <QuickCard title="All users" to="/app/admin/users" icon={ShieldCheck} desc="Browse every user profile, wallet count, KYC history, and mnemonic presence." />
        <QuickCard title="Crypto addresses" to="/app/admin/crypto-keys" icon={Wallet} desc="Review users’ public deposit addresses and admin decrypt history." />
        <QuickCard title="KYC queue" to="/app/admin/kyc" icon={FileText} desc="Approve or reject identity verification submissions." />
        <QuickCard title="Withdrawals" to="/app/admin/withdrawals" icon={Wallet} desc="Approve or reject pending withdrawal requests only." />
        <QuickCard title="Health" to="/admin/health" icon={DatabaseZap} desc="Operational checks, runtime status, and backend diagnostics." />
        <button onClick={handleSeedMarkets} disabled={busy} className="rounded-md border border-amber-400/30 bg-amber-400/10 p-5 text-left transition hover:border-amber-400/60 hover:bg-amber-400/15">
          <div className="flex items-center justify-between text-amber-200">
            <Activity size={18} />
            <ArrowUpRight size={16} />
          </div>
          <div className="mt-4 text-[10px] uppercase tracking-[0.2em] text-amber-300/80">Quick action</div>
          <div className="mt-2 font-display text-2xl">Seed markets</div>
          <div className="mt-2 text-sm text-stone-400">{busy ? 'Running…' : 'Refresh the market universe and instrument inventory.'}</div>
        </button>
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-[1.4fr_0.9fr]">
        <div className="rounded-md border border-white/10 bg-[#0a0f17] p-5">
          <div className="flex items-center justify-between border-b border-white/10 pb-3">
            <div className="text-[10px] uppercase tracking-[0.2em] text-stone-500">Control surface</div>
            <ShieldCheck size={16} className="text-emerald-400" />
          </div>
          <ul className="mt-4 space-y-3 text-sm text-stone-300">
            <li>• Admin-only routes are protected by backend role checks.</li>
            <li>• Deposit addresses remain public; private keys are restricted to admin decryption.</li>
            <li>• Market seeding, KYC moderation, and crypto-address review are available from this console.</li>
          </ul>
        </div>

        <div className="rounded-md border border-white/10 bg-[#0a0f17] p-5">
          <div className="text-[10px] uppercase tracking-[0.2em] text-stone-500">Admin links</div>
          <div className="mt-4 space-y-2">
            <Link to="/app/admin/crypto-keys" className="block rounded-sm border border-white/10 px-3 py-2 text-sm text-stone-200 hover:border-amber-400/40">Open Crypto Keys</Link>
            <Link to="/app/admin/kyc" className="block rounded-sm border border-white/10 px-3 py-2 text-sm text-stone-200 hover:border-amber-400/40">Open KYC</Link>
            <Link to="/admin/health" className="block rounded-sm border border-white/10 px-3 py-2 text-sm text-stone-200 hover:border-amber-400/40">View Health</Link>
          </div>
        </div>
      </div>
    </AdminShell>
  );
}

function QuickCard({ title, desc, to, icon: Icon }: { title: string; desc: string; to: string; icon: typeof Wallet }) {
  return (
    <Link to={to} className="rounded-md border border-white/10 bg-[#0a0f17] p-5 text-left transition hover:border-amber-400/40 hover:bg-[#0f1520]">
      <div className="flex items-center justify-between text-amber-200">
        <Icon size={18} />
        <ArrowUpRight size={16} />
      </div>
      <div className="mt-4 text-[10px] uppercase tracking-[0.2em] text-stone-500">Module</div>
      <div className="mt-2 font-display text-2xl">{title}</div>
      <div className="mt-2 text-sm text-stone-400">{desc}</div>
    </Link>
  );
}

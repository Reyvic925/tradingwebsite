import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, CalendarRange, CircleDollarSign, TrendingUp, WalletCards } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import AppShell from '../components/AppShell';
import { apiGet } from '../lib/api';
import { formatMoney } from '../lib/format';

type PortfolioInvestment = {
  id: number;
  planName?: string;
  fundName?: string;
  initialAmount?: number;
  currentValue?: number;
  roi?: number;
  startDate?: string;
  endDate?: string;
  status?: string;
  lastTransactions?: Array<{
    id?: number;
    type?: string;
    amount?: number;
    description?: string;
    created_at?: string;
    logged_at?: string;
  }>;
};

export default function InvestmentDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [investment, setInvestment] = useState<PortfolioInvestment | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    async function load() {
      try {
        setLoading(true);
        setError('');
        const data = await apiGet<{ investments?: PortfolioInvestment[] }>('/api/portfolio');
        const match = (data?.investments || []).find((item) => String(item.id) === String(id));
        if (!match) {
          setError('Investment not found');
          setInvestment(null);
          return;
        }
        setInvestment(match);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load investment');
      } finally {
        setLoading(false);
      }
    }

    void load();
  }, [id]);

  const summary = useMemo(() => {
    if (!investment) return null;
    const principal = Number(investment.initialAmount || 0);
    const current = Number(investment.currentValue ?? principal);
    const roi = Number(investment.roi || 0);
    return {
      principal,
      current,
      roi,
      pnl: current - principal,
    };
  }, [investment]);

  if (loading) {
    return (
      <AppShell>
        <div className="mt-8 h-48 animate-pulse rounded-md bg-white/5" />
      </AppShell>
    );
  }

  if (error || !investment || !summary) {
    return (
      <AppShell>
        <div className="max-w-xl rounded-md border border-rose-500/25 bg-rose-500/10 p-5 text-rose-100">
          <div className="text-sm">{error || 'Investment not found.'}</div>
          <button onClick={() => navigate('/app/invest')} className="mt-4 rounded-sm bg-rose-500/15 px-3 py-2 text-xs uppercase tracking-widest text-rose-100">
            Back to investments
          </button>
        </div>
      </AppShell>
    );
  }

  const label = investment.planName || investment.fundName || 'Investment';
  const transactions = investment.lastTransactions || [];

  return (
    <AppShell>
      <div className="mb-6 flex items-center justify-between gap-3">
        <button onClick={() => navigate('/app/invest')} className="inline-flex items-center gap-2 rounded-sm border border-white/10 bg-white/5 px-3 py-2 text-xs uppercase tracking-widest text-stone-200">
          <ArrowLeft size={14} /> Back
        </button>
        <div className="text-right">
          <div className="text-[10px] uppercase tracking-[0.2em] text-stone-500">Investment</div>
          <div className="font-display text-3xl">{label}</div>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <StatCard icon={CircleDollarSign} label="Principal" value={formatMoney(summary.principal)} accent="amber" />
        <StatCard icon={WalletCards} label="Current value" value={formatMoney(summary.current)} accent="emerald" />
        <StatCard icon={TrendingUp} label="ROI" value={`${summary.roi.toFixed(2)}%`} accent="sky" />
        <StatCard icon={CalendarRange} label="Status" value={investment.status || 'active'} accent="violet" />
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
        <div className="rounded-md border border-white/10 bg-[#0a0f17] p-5">
          <div className="mb-4 text-[10px] uppercase tracking-[0.2em] text-stone-500">Transaction history</div>
          <div className="space-y-3">
            {transactions.length ? transactions.map((tx, index) => (
              <div key={`${tx.id ?? tx.type ?? 'tx'}-${index}`} className="rounded-sm border border-white/10 bg-white/[0.02] p-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="font-medium text-stone-200">{tx.description || tx.type || 'Transaction'}</div>
                  <div className={`font-mono text-sm ${Number(tx.amount || 0) >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}>
                    {Number(tx.amount || 0) >= 0 ? '+' : '-'}{formatMoney(Math.abs(Number(tx.amount || 0)))}
                  </div>
                </div>
                <div className="mt-1 text-[10px] uppercase tracking-[0.18em] text-stone-500">
                  {tx.type || 'entry'} • {new Date(tx.created_at || tx.logged_at || Date.now()).toLocaleString()}
                </div>
              </div>
            )) : <div className="rounded-sm border border-dashed border-white/10 p-5 text-sm text-stone-500">No transaction history yet.</div>}
          </div>
        </div>

        <div className="rounded-md border border-white/10 bg-[#0a0f17] p-5">
          <div className="text-[10px] uppercase tracking-[0.2em] text-stone-500">Investment facts</div>
          <div className="mt-4 space-y-3 text-sm text-stone-300">
            <div className="flex items-center justify-between border-b border-white/10 pb-2">
              <span>Principal</span>
              <span className="font-mono text-white">{formatMoney(summary.principal)}</span>
            </div>
            <div className="flex items-center justify-between border-b border-white/10 pb-2">
              <span>Current value</span>
              <span className="font-mono text-white">{formatMoney(summary.current)}</span>
            </div>
            <div className="flex items-center justify-between border-b border-white/10 pb-2">
              <span>P&amp;L</span>
              <span className={`font-mono ${summary.pnl >= 0 ? 'text-emerald-300' : 'text-rose-300'}`}>{formatMoney(summary.pnl)}</span>
            </div>
            <div className="flex items-center justify-between border-b border-white/10 pb-2">
              <span>Started</span>
              <span className="font-mono text-white">{investment.startDate ? new Date(investment.startDate).toLocaleDateString() : '—'}</span>
            </div>
            <div className="flex items-center justify-between">
              <span>Maturity</span>
              <span className="font-mono text-white">{investment.endDate ? new Date(investment.endDate).toLocaleDateString() : '—'}</span>
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}

function StatCard({ icon: Icon, label, value, accent }: { icon: typeof CircleDollarSign; label: string; value: string; accent: 'amber' | 'emerald' | 'sky' | 'violet'; }) {
  const palette = {
    amber: 'border-amber-400/20 bg-amber-400/5 text-amber-200',
    emerald: 'border-emerald-400/20 bg-emerald-400/5 text-emerald-200',
    sky: 'border-sky-400/20 bg-sky-400/5 text-sky-200',
    violet: 'border-violet-400/20 bg-violet-400/5 text-violet-200',
  };

  return (
    <div className={`rounded-md border p-4 ${palette[accent]}`}>
      <div className="flex items-center justify-between">
        <div className="text-[10px] uppercase tracking-[0.2em] text-stone-300">{label}</div>
        <Icon size={16} />
      </div>
      <div className="mt-3 text-xl font-display">{value}</div>
    </div>
  );
}

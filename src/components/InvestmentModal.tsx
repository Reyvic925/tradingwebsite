import { useEffect, useState } from 'react';
import { Activity, Clock3, TrendingUp } from 'lucide-react';
import { formatMoney } from '../lib/format';
import type { Investment, Plan } from '../types';
import IndicatorBar from './IndicatorBar';
import PrimaryPerformanceChart from './PrimaryPerformanceChart';

interface InvestmentModalProps {
  investment: Investment;
  plan: Plan | null;
  onClose: () => void;
  onRefresh?: () => void;
}

export default function InvestmentModal({ investment, plan, onClose, onRefresh }: InvestmentModalProps) {
  const [daysElapsed, setDaysElapsed] = useState(Number(investment.days_elapsed || 0));
  const [status, setStatus] = useState(investment.status);
  const [earned, setEarned] = useState(Number(investment.earned || 0));

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const syncFromInvestment = () => {
      const elapsed = Math.max(0, Math.min(Number(plan?.duration_days || 1), Math.floor((Date.now() - new Date(investment.start_date).getTime()) / 86400000)));
      setDaysElapsed(elapsed);
      setEarned(Number(investment.earned || 0));
      setStatus(investment.status);
      onRefresh?.();
    };

    syncFromInvestment();
    const timer = setInterval(syncFromInvestment, 5 * 60 * 1000);
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      clearInterval(timer);
      window.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [investment, plan, onClose, onRefresh]);

  if (!plan) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
        <div className="w-full max-w-xl rounded-2xl border border-white/10 bg-stone-950 p-6">
          <div className="text-sm text-stone-400">Plan data unavailable</div>
          <button
            onClick={onClose}
            className="mt-4 rounded-md bg-stone-700 px-4 py-2 text-sm font-semibold uppercase tracking-widest text-white"
          >
            Close
          </button>
        </div>
      </div>
    );
  }

  const principal = Number(investment.amount || 0);
  const progress = Math.min(100, (daysElapsed / Math.max(1, Number(plan.duration_days || 1))) * 100);
  const pnlPct = principal > 0 ? (earned / principal) * 100 : 0;
  const daysRemaining = Math.max(0, Number(plan.duration_days || 1) - daysElapsed);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/80 p-3 backdrop-blur-sm" onClick={onClose}>
      <div
        className="max-h-[92vh] w-full max-w-6xl overflow-hidden rounded-3xl border border-[#2a2e39] bg-gradient-to-br from-[#1a1f2a] to-[#131722] shadow-[0_30px_80px_rgba(0,0,0,0.65)]"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="max-h-[92vh] overflow-y-auto">
          <div className="flex items-center justify-between border-b border-white/5 bg-[#111722]/80 px-5 py-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-500/15 text-blue-300">
                <TrendingUp size={18} />
              </div>
              <div>
                <div className="text-[9px] uppercase tracking-[0.28em] text-stone-500">Investment</div>
                <h2 className="mt-1 font-display text-2xl text-white">{investment.plan_name}</h2>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.22em] ${status === 'active' ? 'border-emerald-400/30 bg-emerald-500/10 text-emerald-300' : 'border-stone-500/30 bg-stone-500/10 text-stone-300'}`}>
                <span className={`h-2 w-2 rounded-full ${status === 'active' ? 'bg-emerald-400 animate-pulse' : 'bg-stone-400'}`} />
                {status}
              </div>
              <button
                onClick={onClose}
                className="rounded-full border border-white/10 bg-white/5 px-2 py-1 text-lg text-stone-300 transition hover:border-white/20 hover:text-white"
                aria-label="Close investment details"
              >
                ✕
              </button>
            </div>
          </div>

          <div className="grid gap-0 lg:grid-cols-[1.7fr_0.8fr]">
            <div className="border-r border-white/5 p-5">
              <PrimaryPerformanceChart investment={investment} plan={plan} />
              <IndicatorBar investment={investment} plan={plan} daysElapsed={daysElapsed} />

              <div className="rounded-2xl border border-[#2a2e39] bg-[#121922] p-4">
                <div className="mb-3 flex items-center justify-between">
                  <div className="text-[10px] uppercase tracking-[0.28em] text-stone-500">Gains & losses</div>
                  <div className="text-[10px] uppercase tracking-[0.22em] text-stone-400">Live</div>
                </div>

                <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                  <div className="rounded-xl border border-white/5 bg-white/[0.02] p-3">
                    <div className="text-[9px] uppercase tracking-[0.22em] text-stone-500">Invested</div>
                    <div className="mt-2 font-mono text-sm text-amber-200">{formatMoney(principal)}</div>
                  </div>
                  <div className="rounded-xl border border-white/5 bg-white/[0.02] p-3">
                    <div className="text-[9px] uppercase tracking-[0.22em] text-stone-500">Current</div>
                    <div className="mt-2 font-mono text-sm text-emerald-300">{formatMoney(principal + earned)}</div>
                  </div>
                  <div className="rounded-xl border border-white/5 bg-white/[0.02] p-3">
                    <div className="text-[9px] uppercase tracking-[0.22em] text-stone-500">P&L</div>
                    <div className={`mt-2 font-mono text-sm ${pnlPct >= 0 ? 'text-emerald-300' : 'text-red-300'}`}>
                      {pnlPct >= 0 ? '+' : ''}{pnlPct.toFixed(2)}%
                    </div>
                  </div>
                  <div className="rounded-xl border border-white/5 bg-white/[0.02] p-3">
                    <div className="text-[9px] uppercase tracking-[0.22em] text-stone-500">Maturity</div>
                    <div className="mt-2 font-mono text-sm text-stone-200">{daysRemaining}d</div>
                  </div>
                </div>
              </div>
            </div>

            <aside className="bg-[#101720]/90 p-5">
              <div className="space-y-5">
                <div className="rounded-2xl border border-[#2a2e39] bg-white/[0.02] p-4">
                  <div className="text-[9px] uppercase tracking-[0.28em] text-stone-500">Overview</div>
                  <div className="mt-4 space-y-3 text-sm">
                    <div className="flex items-center justify-between border-b border-white/5 pb-2">
                      <span className="text-stone-400">Amount</span>
                      <span className="font-mono text-white">{formatMoney(principal)}</span>
                    </div>
                    <div className="flex items-center justify-between border-b border-white/5 pb-2">
                      <span className="text-stone-400">Total return</span>
                      <span className="font-mono text-amber-300">{Number(plan.total_return).toFixed(0)}%</span>
                    </div>
                    <div className="flex items-center justify-between border-b border-white/5 pb-2">
                      <span className="text-stone-400">Elapsed</span>
                      <span className="font-mono text-stone-200">{daysElapsed}d</span>
                    </div>
                    <div className="flex items-center justify-between border-b border-white/5 pb-2">
                      <span className="text-stone-400">Started</span>
                      <span className="font-mono text-stone-200">{new Date(investment.start_date).toLocaleDateString()}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-stone-400">Ends</span>
                      <span className="font-mono text-stone-200">{new Date(investment.end_date).toLocaleDateString()}</span>
                    </div>
                  </div>
                </div>

                <div className="rounded-2xl border border-[#2a2e39] bg-white/[0.02] p-4">
                  <div className="flex items-center gap-2 text-[9px] uppercase tracking-[0.28em] text-stone-500">
                    <Clock3 size={12} />
                    Sync cadence
                  </div>
                  <div className="mt-3 font-mono text-sm text-stone-200">Every 5 minutes</div>
                  <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-white/5">
                    <div className="h-full w-[78%] rounded-full bg-gradient-to-r from-emerald-400 to-blue-400" />
                  </div>
                </div>
              </div>
            </aside>
          </div>
        </div>
      </div>
    </div>
  );
}

import { useEffect, useState } from 'react';
import { formatMoney } from '../lib/format';
import type { Investment, Plan } from '../types';
import GainsLossesChart from './GainsLossesChart';

interface InvestmentModalProps {
  investment: Investment;
  plan: Plan | null;
  onClose: () => void;
  onRefresh?: () => void;
}

export default function InvestmentModal({ investment, plan, onClose, onRefresh }: InvestmentModalProps) {
  const [tab, setTab] = useState<'gains' | 'losses'>('gains');
  const [daysElapsed, setDaysElapsed] = useState(investment.days_elapsed || 0);
  const [earned, setEarned] = useState(Number(investment.earned || 0));
  const [status, setStatus] = useState(investment.status);

  useEffect(() => {
    const syncFromInvestment = () => {
      const nextDaysElapsed = Math.floor((Date.now() - new Date(investment.start_date).getTime()) / 86400000);
      const maxElapsed = plan ? Number(plan.duration_days) : 1;
      setDaysElapsed(Math.min(maxElapsed, Math.max(0, nextDaysElapsed)));
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
    };
  }, [investment, plan, onClose, onRefresh]);

  if (!plan) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
        <div className="w-full max-w-2xl rounded-lg border border-white/10 bg-stone-950 p-6">
          <div className="text-sm text-stone-400">Plan data unavailable</div>
          <button
            onClick={onClose}
            className="mt-4 rounded-sm bg-stone-700 px-4 py-2 text-sm font-semibold uppercase tracking-widest text-white"
          >
            Close
          </button>
        </div>
      </div>
    );
  }

  const durationDays = Number(plan.duration_days);
  const totalReturn = Number(plan.total_return);
  const progress = Math.min(100, (daysElapsed / durationDays) * 100);
  const principal = Number(investment.amount);
  const performancePct = principal > 0 ? (earned / principal) * 100 : 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm" onClick={onClose}>
      <div
        className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-lg border border-white/10 bg-stone-950 shadow-2xl shadow-black/40"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="flex items-start justify-between border-b border-white/5 px-6 py-5">
          <div>
            <div className="text-[10px] uppercase tracking-[0.28em] text-stone-500">Investment</div>
            <h2 className="mt-2 font-display text-2xl">{investment.plan_name}</h2>
            <p className="mt-1 text-sm text-stone-400">Status: <span className="capitalize text-amber-200">{status}</span></p>
          </div>
          <button
            onClick={onClose}
            className="rounded-full border border-white/10 bg-white/5 px-2 py-1 text-lg text-stone-300 transition hover:border-white/20 hover:text-white"
            aria-label="Close investment details"
          >
            ✕
          </button>
        </div>

        <div className="space-y-6 p-6">
          <div className="grid grid-cols-2 gap-4">
            <div className="rounded-xl border border-white/5 bg-white/[0.02] p-4">
              <div className="text-[10px] uppercase tracking-[0.24em] text-stone-500">Principal</div>
              <div className="mt-2 font-mono text-xl font-semibold text-amber-200">{formatMoney(principal)}</div>
            </div>
            <div className="rounded-xl border border-white/5 bg-white/[0.02] p-4">
              <div className="text-[10px] uppercase tracking-[0.24em] text-stone-500">Accrued</div>
              <div className={`mt-2 font-mono text-xl font-semibold ${earned >= 0 ? 'text-emerald-300' : 'text-red-300'}`}>
                {formatMoney(earned)}
              </div>
            </div>
            <div className="rounded-xl border border-white/5 bg-white/[0.02] p-4">
              <div className="text-[10px] uppercase tracking-[0.24em] text-stone-500">Duration</div>
              <div className="mt-2 font-mono text-xl font-semibold text-stone-100">{daysElapsed} / {durationDays}d</div>
            </div>
            <div className="rounded-xl border border-white/5 bg-white/[0.02] p-4">
              <div className="text-[10px] uppercase tracking-[0.24em] text-stone-500">Plan return</div>
              <div className="mt-2 font-mono text-xl font-semibold text-amber-300">{totalReturn}%</div>
            </div>
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between">
              <div className="text-[10px] uppercase tracking-[0.24em] text-stone-500">Progress</div>
              <div className="font-mono text-sm text-amber-200">{Math.round(progress)}%</div>
            </div>
            <div className="h-2.5 w-full overflow-hidden rounded-full bg-white/5">
              <div
                className="h-full rounded-full bg-gradient-to-r from-amber-400 via-amber-300 to-emerald-400 transition-all duration-500"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>

          <div className="flex gap-2 border-b border-white/5 pb-2">
            <button
              onClick={() => setTab('gains')}
              className={`px-4 py-2 text-[10px] font-semibold uppercase tracking-[0.22em] transition ${
                tab === 'gains'
                  ? 'border-b-2 border-emerald-400 text-emerald-300'
                  : 'text-stone-400 hover:text-stone-200'
              }`}
            >
              Gains
            </button>
            <button
              onClick={() => setTab('losses')}
              className={`px-4 py-2 text-[10px] font-semibold uppercase tracking-[0.22em] transition ${
                tab === 'losses'
                  ? 'border-b-2 border-red-400 text-red-300'
                  : 'text-stone-400 hover:text-stone-200'
              }`}
            >
              Losses
            </button>
          </div>

          <GainsLossesChart
            investment={investment}
            plan={plan}
            tab={tab}
            daysElapsed={daysElapsed}
            earned={earned}
          />

          <div className="grid grid-cols-2 gap-4 border-t border-white/5 pt-5">
            <div>
              <div className="text-[10px] uppercase tracking-[0.24em] text-stone-500 mb-2">Start</div>
              <div className="font-mono text-sm">{new Date(investment.start_date).toLocaleDateString()}</div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-[0.24em] text-stone-500 mb-2">End</div>
              <div className="font-mono text-sm">{new Date(investment.end_date).toLocaleDateString()}</div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-[0.24em] text-stone-500 mb-2">PnL %</div>
              <div className={`font-mono text-sm ${performancePct >= 0 ? 'text-emerald-300' : 'text-red-300'}`}>
                {performancePct >= 0 ? '+' : ''}{performancePct.toFixed(2)}%
              </div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-[0.24em] text-stone-500 mb-2">Projected total</div>
              <div className="font-mono text-sm text-emerald-300">{formatMoney(principal + earned)}</div>
            </div>
          </div>

          <button
            onClick={onClose}
            className="w-full rounded-md border border-white/10 bg-white/5 px-4 py-3 text-[10px] font-semibold uppercase tracking-[0.24em] text-stone-200 transition hover:bg-white/10"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

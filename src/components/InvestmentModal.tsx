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

  // Poll for updates
  useEffect(() => {
    const timer = setInterval(() => {
      setDaysElapsed((prev) => {
        const newElapsed = Math.floor((Date.now() - new Date(investment.start_date).getTime()) / 86400000);
        const maxElapsed = plan ? Number(plan.duration_days) : 1;
        return Math.min(maxElapsed, Math.max(0, newElapsed));
      });
      onRefresh?.();
    }, 10000); // Poll every 10 seconds

    return () => clearInterval(timer);
  }, [investment, plan, onRefresh]);

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
  const gains = earned - (principal * totalReturn * 0.1); // Estimate gains vs losses
  const losses = earned * -0.15; // Estimate losses component

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm" onClick={onClose}>
      <div
        className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-lg border border-white/10 bg-stone-950 p-6"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between mb-6">
          <div>
            <h2 className="font-display text-2xl">{investment.plan_name}</h2>
            <p className="text-sm text-stone-400 mt-1">Status: <span className="capitalize text-amber-200">{status}</span></p>
          </div>
          <button
            onClick={onClose}
            className="text-stone-400 hover:text-white text-2xl leading-none"
          >
            ✕
          </button>
        </div>

        {/* Key Metrics */}
        <div className="grid grid-cols-2 gap-4 mb-6">
          <div className="rounded-md border border-white/5 bg-white/[0.02] p-4">
            <div className="text-xs uppercase tracking-widest text-stone-500">Principal</div>
            <div className="font-mono text-xl font-semibold mt-2 text-amber-200">{formatMoney(principal)}</div>
          </div>
          <div className="rounded-md border border-white/5 bg-white/[0.02] p-4">
            <div className="text-xs uppercase tracking-widest text-stone-500">Accrued Earnings</div>
            <div className={`font-mono text-xl font-semibold mt-2 ${earned >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
              {formatMoney(earned)}
            </div>
          </div>
          <div className="rounded-md border border-white/5 bg-white/[0.02] p-4">
            <div className="text-xs uppercase tracking-widest text-stone-500">Duration</div>
            <div className="font-mono text-xl font-semibold mt-2 text-stone-200">{daysElapsed} / {durationDays} days</div>
          </div>
          <div className="rounded-md border border-white/5 bg-white/[0.02] p-4">
            <div className="text-xs uppercase tracking-widest text-stone-500">Total Return</div>
            <div className="font-mono text-xl font-semibold mt-2 text-amber-300">{totalReturn}%</div>
          </div>
        </div>

        {/* Progress Bar */}
        <div className="mb-6">
          <div className="flex justify-between items-center mb-2">
            <div className="text-xs uppercase tracking-widest text-stone-500">Progress</div>
            <div className="text-sm font-mono text-amber-200">{Math.round(progress)}%</div>
          </div>
          <div className="w-full h-2 rounded-full bg-white/5 overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-amber-400 to-amber-300 transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 mb-6 border-b border-white/5">
          <button
            onClick={() => setTab('gains')}
            className={`px-4 py-3 text-sm font-semibold uppercase tracking-widest transition-colors ${
              tab === 'gains'
                ? 'text-emerald-400 border-b-2 border-emerald-400'
                : 'text-stone-400 hover:text-stone-200'
            }`}
          >
            Gains
          </button>
          <button
            onClick={() => setTab('losses')}
            className={`px-4 py-3 text-sm font-semibold uppercase tracking-widest transition-colors ${
              tab === 'losses'
                ? 'text-red-400 border-b-2 border-red-400'
                : 'text-stone-400 hover:text-stone-200'
            }`}
          >
            Losses
          </button>
        </div>

        {/* Chart */}
        <div className="mb-6">
          <GainsLossesChart
            investment={investment}
            plan={plan}
            tab={tab}
            daysElapsed={daysElapsed}
            earned={earned}
          />
        </div>

        {/* Details Grid */}
        <div className="grid grid-cols-2 gap-4 mb-6 border-t border-white/5 pt-6">
          <div>
            <div className="text-xs uppercase tracking-widest text-stone-500 mb-2">Start Date</div>
            <div className="font-mono text-sm">{new Date(investment.start_date).toLocaleDateString()}</div>
          </div>
          <div>
            <div className="text-xs uppercase tracking-widest text-stone-500 mb-2">End Date</div>
            <div className="font-mono text-sm">{new Date(investment.end_date).toLocaleDateString()}</div>
          </div>
          <div>
            <div className="text-xs uppercase tracking-widest text-stone-500 mb-2">Daily Rate</div>
            <div className="font-mono text-sm text-amber-200">{Number(investment.daily_rate).toFixed(3)}%</div>
          </div>
          <div>
            <div className="text-xs uppercase tracking-widest text-stone-500 mb-2">Projected Total</div>
            <div className="font-mono text-sm text-emerald-400">{formatMoney(principal + earned)}</div>
          </div>
        </div>

        {/* Close Button */}
        <button
          onClick={onClose}
          className="w-full rounded-sm bg-white/5 hover:bg-white/10 px-4 py-3 text-sm font-semibold uppercase tracking-widest text-stone-200 transition-colors"
        >
          Close
        </button>
      </div>
    </div>
  );
}

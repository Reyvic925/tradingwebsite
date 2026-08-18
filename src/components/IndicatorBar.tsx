import type { Investment, Plan } from '../types';

interface IndicatorBarProps {
  investment: Investment;
  plan: Plan;
  daysElapsed: number;
}

export default function IndicatorBar({ investment, plan, daysElapsed }: IndicatorBarProps) {
  const principal = Number(investment.amount || 0);
  const earned = Number(investment.earned || 0);
  const progress = Math.min(1, daysElapsed / Math.max(1, Number(plan.duration_days || 1)));
  const pnlPct = principal > 0 ? (earned / principal) * 100 : 0;
  const peakValue = principal + Math.max(0, earned);
  const drawdown = peakValue > 0 ? Math.max(0, ((peakValue - (principal + earned)) / peakValue) * 100) : 0;
  const volatility = Math.max(0.5, Math.abs(pnlPct) * 0.18 + 1.4);
  const daysRemaining = Math.max(0, Number(plan.duration_days || 1) - daysElapsed);

  const metrics = [
    { label: 'P&L %', value: `${pnlPct >= 0 ? '+' : ''}${pnlPct.toFixed(2)}%`, tone: pnlPct >= 0 ? 'text-emerald-300' : 'text-red-300' },
    { label: 'Drawdown', value: `${drawdown.toFixed(2)}%`, tone: 'text-amber-300' },
    { label: 'Volatility', value: `${volatility.toFixed(2)}%`, tone: 'text-violet-300' },
    { label: 'Progress', value: `${(progress * 100).toFixed(0)}%`, tone: 'text-cyan-300' },
    { label: 'Days left', value: `${daysRemaining}`, tone: 'text-stone-200' },
  ];

  return (
    <div className="mb-5 grid grid-cols-2 gap-2 rounded-xl border border-[#2a2e39] bg-[#151b25]/80 p-2 md:grid-cols-5">
      {metrics.map((metric) => (
        <div key={metric.label} className="border-r border-white/5 px-3 py-2 last:border-r-0">
          <div className="text-[9px] uppercase tracking-[0.24em] text-stone-500">{metric.label}</div>
          <div className={`mt-2 font-mono text-sm font-semibold ${metric.tone}`}>{metric.value}</div>
        </div>
      ))}
    </div>
  );
}

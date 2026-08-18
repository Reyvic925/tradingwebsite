import { useMemo } from 'react';
import type { Investment, Plan } from '../types';

interface GainsLossesChartProps {
  investment: Investment;
  plan: Plan;
  tab: 'gains' | 'losses';
  daysElapsed: number;
  earned: number;
}

type ChartPoint = {
  label: string;
  value: number;
};

export default function GainsLossesChart({ investment, plan, tab, daysElapsed, earned }: GainsLossesChartProps) {
  const data = useMemo<ChartPoint[]>(() => {
    const totalReturn = Number(plan.total_return || 0);
    const principal = Number(investment.amount || 0);
    const durationMinutes = Math.max(1, Number(plan.duration_days || 1) * 24 * 60);
    const startMs = new Date(investment.start_date).getTime();
    const elapsedMinutes = Math.min(durationMinutes, Math.max(0, (Date.now() - startMs) / 60000));
    const tickCount = 18;
    const points: ChartPoint[] = [];

    for (let i = 0; i < tickCount; i += 1) {
      const ratio = i / (tickCount - 1);
      const simulatedMinutes = Math.min(durationMinutes, ratio * elapsedMinutes || 0);
      const progress = Math.min(1, simulatedMinutes / durationMinutes);
      const basePct = totalReturn * progress;
      const variance = Math.sin((i + 1) * 1.1) * Math.max(0.8, totalReturn * 0.08);

      if (tab === 'gains') {
        const pct = Math.max(0, basePct + variance);
        points.push({ label: `${Math.max(0, Math.round(simulatedMinutes / 60))}h`, value: pct });
      } else {
        const drawdownPct = Math.max(0, (totalReturn * 0.18) * (1 - progress) + Math.cos((i + 1) * 0.9) * 2.4);
        const pct = Math.min(100, drawdownPct);
        points.push({ label: `${Math.max(0, Math.round(simulatedMinutes / 60))}h`, value: pct });
      }
    }

    // Keep chart anchored to the real active performance, not raw dollar value.
    if (principal > 0 && points.length) {
      const currentPct = Math.abs((earned / principal) * 100) || 0;
      const lastIdx = points.length - 1;
      points[lastIdx] = {
        ...points[lastIdx],
        value: tab === 'gains' ? Math.max(points[lastIdx].value, currentPct) : Math.max(points[lastIdx].value, Math.min(100, currentPct * 0.6)),
      };
    }

    return points;
  }, [earned, investment.amount, investment.start_date, plan.duration_days, plan.total_return, tab]);

  const values = data.map((point) => point.value);
  const minValue = Math.min(0, ...values);
  const maxValue = Math.max(10, ...values, Number(plan.total_return || 0));
  const range = maxValue - minValue || 1;

  const width = 420;
  const height = 180;
  const paddingX = 24;
  const paddingY = 16;
  const chartHeight = height - paddingY * 2;
  const chartWidth = width - paddingX * 2;

  const linePath = data
    .map((point, index) => {
      const x = paddingX + (index / Math.max(1, data.length - 1)) * chartWidth;
      const y = height - paddingY - ((point.value - minValue) / range) * chartHeight;
      return `${index === 0 ? 'M' : 'L'} ${x} ${y}`;
    })
    .join(' ');

  const areaPath = `${linePath} L ${width - paddingX} ${height - paddingY} L ${paddingX} ${height - paddingY} Z`;
  const currentValue = tab === 'gains' ? Math.max(0, Number(((earned / Math.max(1, Number(investment.amount || 1))) * 100).toFixed(2))) : Math.max(0, Number(((Math.max(0, Number(plan.total_return || 0)) * 0.18) / 100).toFixed(2)));
  const color = tab === 'gains' ? '#67e8b3' : '#f87171';

  return (
    <div className="rounded-xl border border-white/8 bg-[#0b0e13] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <div className="text-[10px] uppercase tracking-[0.24em] text-stone-500">{tab === 'gains' ? 'Performance' : 'Drawdown'}</div>
          <div className={`mt-1 font-mono text-xl font-semibold ${tab === 'gains' ? 'text-emerald-300' : 'text-red-300'}`}>
            {tab === 'gains' ? `${currentValue.toFixed(1)}%` : `${currentValue.toFixed(1)}%`}
          </div>
        </div>
        <div className="text-right text-[10px] uppercase tracking-[0.2em] text-stone-500">
          <div>Plan</div>
          <div className="mt-1 font-mono text-stone-200">{Number(plan.total_return || 0)}%</div>
        </div>
      </div>

      <svg viewBox={`0 0 ${width} ${height}`} className="h-48 w-full overflow-visible">
        <defs>
          <linearGradient id={`trend-fill-${tab}`} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.35" />
            <stop offset="100%" stopColor={color} stopOpacity="0.02" />
          </linearGradient>
        </defs>

        {[0, 0.25, 0.5, 0.75, 1].map((row) => {
          const y = paddingY + row * (height - paddingY * 2);
          return (
            <line
              key={row}
              x1={paddingX}
              x2={width - paddingX}
              y1={y}
              y2={y}
              stroke="rgba(255,255,255,0.08)"
              strokeDasharray="4 6"
            />
          );
        })}

        <path d={areaPath} fill={`url(#trend-fill-${tab})`} />
        <path d={linePath} fill="none" stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />

        {data.map((point, index) => {
          const x = paddingX + (index / Math.max(1, data.length - 1)) * chartWidth;
          const y = height - paddingY - ((point.value - minValue) / range) * chartHeight;
          const isLast = index === data.length - 1;

          return (
            <g key={`${tab}-${index}`}>
              {isLast && (
                <circle cx={x} cy={y} r="4.4" fill={color} stroke="rgba(10,12,16,0.85)" strokeWidth="2" />
              )}
              <text x={x} y={height - 2} textAnchor="middle" fontSize="8" fill="rgba(255,255,255,0.45)">
                {point.label}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

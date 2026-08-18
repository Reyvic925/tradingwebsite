import { useEffect, useState } from 'react';
import type { Investment, Plan } from '../types';

interface GainsLossesChartProps {
  investment: Investment;
  plan: Plan;
  tab: 'gains' | 'losses';
  daysElapsed: number;
  earned: number;
}

interface DataPoint {
  day: number;
  value: number;
}

export default function GainsLossesChart({
  investment,
  plan,
  tab,
  daysElapsed,
  earned,
}: GainsLossesChartProps) {
  const [data, setData] = useState<DataPoint[]>([]);

  useEffect(() => {
    // Generate chart data based on elapsed days
    const principal = Number(investment.amount);
    const totalReturn = Number(plan.total_return) / 100;
    const durationDays = Number(plan.duration_days);
    const startDate = new Date(investment.start_date);

    const points: DataPoint[] = [];

    for (let day = 0; day <= daysElapsed; day++) {
      const progress = Math.min(1, day / durationDays);
      
      if (tab === 'gains') {
        // Simulate gains growth over time with some variance
        const baseGains = principal * totalReturn * progress;
        const variance = Math.sin((day / durationDays) * Math.PI) * baseGains * 0.15;
        const variance2 = ((day % 7) - 3.5) * baseGains * 0.05; // Weekly variance
        const value = baseGains + variance + variance2;
        points.push({ day, value: Math.max(0, value) });
      } else {
        // Simulate losses (draw-downs)
        const baseDrawdown = principal * (totalReturn * 0.18) * (1 - progress);
        const variance = Math.sin((day / durationDays) * Math.PI * 2) * baseDrawdown * 0.25;
        const value = Math.max(-principal, baseDrawdown + variance);
        points.push({ day, value });
      }
    }

    setData(points);
  }, [investment, plan, tab, daysElapsed]);

  if (data.length === 0) {
    return (
      <div className="h-48 rounded-md border border-white/5 bg-white/[0.02] flex items-center justify-center">
        <div className="text-sm text-stone-400">No data yet</div>
      </div>
    );
  }

  // Find min and max for scaling
  const values = data.map((d) => d.value);
  const minValue = Math.min(...values);
  const maxValue = Math.max(...values);
  const range = maxValue - minValue || 1;
  const padding = range * 0.1;
  const scaledMin = minValue - padding;
  const scaledMax = maxValue + padding;
  const scaledRange = scaledMax - scaledMin;

  // Chart dimensions
  const width = 100;
  const height = 200;
  const chartWidth = 95;
  const chartHeight = 85;

  // Create SVG path
  const points_str = data
    .map((d, i) => {
      const x = (i / (data.length - 1 || 1)) * chartWidth + 2.5;
      const y = height - 20 - ((d.value - scaledMin) / scaledRange) * chartHeight;
      return `${x},${y}`;
    })
    .join(' ');

  const color = tab === 'gains' ? '#10b981' : '#ef4444';
  const colorLight = tab === 'gains' ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)';

  return (
    <div className="rounded-md border border-white/5 bg-white/[0.02] p-4">
      <div className="mb-4">
        <div className="text-xs uppercase tracking-widest text-stone-500 mb-2">
          {tab === 'gains' ? 'Cumulative Gains' : 'Cumulative Losses'}
        </div>
        <div className={`font-mono text-lg font-semibold ${tab === 'gains' ? 'text-emerald-400' : 'text-red-400'}`}>
          ${earned.toFixed(2)}
        </div>
      </div>

      <svg viewBox={`0 0 100 ${height}`} className="w-full" style={{ minHeight: '200px' }}>
        {/* Grid lines */}
        <line x1="2.5" y1="15" x2="97.5" y2="15" stroke="rgba(255,255,255,0.05)" strokeWidth="0.5" />
        <line x1="2.5" y1="65" x2="97.5" y2="65" stroke="rgba(255,255,255,0.05)" strokeWidth="0.5" />
        <line x1="2.5" y1="115" x2="97.5" y2="115" stroke="rgba(255,255,255,0.05)" strokeWidth="0.5" />

        {/* Area under curve */}
        <defs>
          <linearGradient id={`gradient-${tab}`} x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor={color} stopOpacity="0.3" />
            <stop offset="100%" stopColor={color} stopOpacity="0.05" />
          </linearGradient>
        </defs>

        <polyline
          points={`2.5,${height - 20} ${points_str} 97.5,${height - 20}`}
          fill={`url(#gradient-${tab})`}
          stroke="none"
        />

        {/* Line */}
        <polyline
          points={points_str}
          fill="none"
          stroke={color}
          strokeWidth="1.5"
          vectorEffect="non-scaling-stroke"
        />

        {/* Points */}
        {data.length <= 30 &&
          data.map((d, i) => {
            const x = (i / (data.length - 1 || 1)) * chartWidth + 2.5;
            const y = height - 20 - ((d.value - scaledMin) / scaledRange) * chartHeight;
            return (
              <circle
                key={i}
                cx={x}
                cy={y}
                r="1"
                fill={color}
                opacity={i === data.length - 1 ? 1 : 0.5}
              />
            );
          })}

        {/* Axis labels */}
        <text x="2" y={height - 3} fontSize="8" fill="rgba(255,255,255,0.5)" textAnchor="start">
          Day 0
        </text>
        <text x="95" y={height - 3} fontSize="8" fill="rgba(255,255,255,0.5)" textAnchor="end">
          Day {daysElapsed}
        </text>

        {/* Y-axis values */}
        <text x="1" y="20" fontSize="8" fill="rgba(255,255,255,0.5)" textAnchor="end">
          ${(scaledMax / 1).toFixed(0)}
        </text>
        <text x="1" y="70" fontSize="8" fill="rgba(255,255,255,0.5)" textAnchor="end">
          ${((scaledMax + scaledMin) / 2 / 1).toFixed(0)}
        </text>
        <text x="1" y="120" fontSize="8" fill="rgba(255,255,255,0.5)" textAnchor="end">
          ${(scaledMin / 1).toFixed(0)}
        </text>
      </svg>

      <div className="mt-4 grid grid-cols-2 gap-4 text-xs">
        <div>
          <div className="text-stone-500 uppercase tracking-widest mb-1">Max</div>
          <div className="font-mono text-sm font-semibold">${Math.max(...values).toFixed(2)}</div>
        </div>
        <div>
          <div className="text-stone-500 uppercase tracking-widest mb-1">Min</div>
          <div className="font-mono text-sm font-semibold">${Math.min(...values).toFixed(2)}</div>
        </div>
      </div>
    </div>
  );
}

import { useMemo } from 'react';
import { Area, AreaChart, CartesianGrid, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import type { Investment, Plan } from '../types';

interface PrimaryPerformanceChartProps {
  investment: Investment;
  plan: Plan;
}

type ChartPoint = {
  timestamp: number;
  value: number;
  volatility: number;
  label: string;
  percent: number;
  change: number;
};

function prepareChartData(investment: Investment, plan: Plan): ChartPoint[] {
  const amount = Number(investment.amount || 0);
  const totalReturn = Number(plan.total_return || 0);
  const currentEarned = Number(investment.earned || 0);
  const totalPoints = 60;

  const synthetic: ChartPoint[] = [];
  let previousValue = 0;
  let previousVolatility = 0.4;

  for (let i = 0; i < totalPoints; i += 1) {
    const progress = i / totalPoints;
    const deterministic = amount * (totalReturn / 100) * progress;
    const randomSwing = ((Math.sin((i + 1) * 1.7) + (Math.random() - 0.5) * 0.8) * deterministic * 0.12);
    const value = Math.max(0, deterministic + previousVolatility * 0.8 + randomSwing);
    const volatility = Math.max(0.4, Math.abs(value - previousValue) * 0.9 + 0.8);
    previousValue = value;
    previousVolatility = volatility;

    const timestamp = Date.now() - (totalPoints - i) * 5 * 60 * 1000;
    const pct = amount > 0 ? (value / amount) * 100 : 0;
    synthetic.push({
      timestamp,
      value,
      volatility,
      label: `D${i + 1}`,
      percent: pct,
      change: i === 0 ? 0 : ((value - synthetic[i - 1].value) / Math.max(1, synthetic[i - 1].value)) * 100,
    });
  }

  if (synthetic.length) {
    synthetic[synthetic.length - 1] = {
      ...synthetic[synthetic.length - 1],
      value: currentEarned,
      percent: amount > 0 ? (currentEarned / amount) * 100 : 0,
      change: synthetic.length > 1 ? ((currentEarned - synthetic[synthetic.length - 2].value) / Math.max(1, synthetic[synthetic.length - 2].value)) * 100 : 0,
    };
  }

  const lastValue = currentEarned || synthetic[synthetic.length - 1]?.value || 0;
  const finalPoint = {
    timestamp: Date.now(),
    value: lastValue,
    volatility: Math.max(0.5, Math.abs(lastValue - (synthetic[synthetic.length - 1]?.value || lastValue)) * 0.35 + 0.8),
    label: `Now`,
    percent: amount > 0 ? (lastValue / amount) * 100 : 0,
    change: synthetic.length > 1 ? ((lastValue - synthetic[synthetic.length - 1].value) / Math.max(1, synthetic[synthetic.length - 1].value)) * 100 : 0,
  };

  return [...synthetic, finalPoint].slice(-60);
}

export default function PrimaryPerformanceChart({ investment, plan }: PrimaryPerformanceChartProps) {
  const chartData = useMemo(() => prepareChartData(investment, plan), [investment, plan]);

  const currentValue = Number(chartData[chartData.length - 1]?.value || 0);
  const startValue = Number(chartData[0]?.value || 0);
  const deltaPct = startValue ? ((currentValue - startValue) / Math.max(1, startValue)) * 100 : 0;

  const lastPoint = chartData[chartData.length - 1];
  const volatilityBand = chartData.map((point) => ({
    ...point,
    high: point.value * 1.18,
    low: Math.max(0, point.value * 0.82),
  }));

  return (
    <div className="mb-5 rounded-2xl border border-[#2a2e39] bg-[#131722] p-3 shadow-[0_18px_50px_rgba(0,0,0,0.28)]">
      <div className="mb-3 flex items-center justify-between gap-3 border-b border-white/5 pb-3">
        <div>
          <div className="text-[9px] uppercase tracking-[0.28em] text-stone-500">Primary performance</div>
          <div className="mt-2 font-mono text-lg text-stone-100">{`$${currentValue.toLocaleString(undefined, { maximumFractionDigits: 2 })}`}</div>
        </div>
        <div className="text-right">
          <div className="text-[9px] uppercase tracking-[0.28em] text-stone-500">Current</div>
          <div className={`mt-2 font-mono text-lg ${deltaPct >= 0 ? 'text-emerald-300' : 'text-red-300'}`}>
            {deltaPct >= 0 ? '+' : ''}{deltaPct.toFixed(2)}%
          </div>
        </div>
      </div>

      <div className="h-72 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={volatilityBand} margin={{ top: 8, right: 12, left: 0, bottom: 12 }}>
            <defs>
              <linearGradient id="volatilityGradient" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor="#2962FF" stopOpacity={0.26} />
                <stop offset="100%" stopColor="#2962FF" stopOpacity={0.02} />
              </linearGradient>
            </defs>

            <CartesianGrid stroke="rgba(255,255,255,0.06)" strokeDasharray="3 3" vertical={false} />
            <XAxis
              dataKey="label"
              tick={{ fill: '#787b86', fontSize: 10 }}
              tickLine={false}
              axisLine={false}
              minTickGap={20}
            />
            <YAxis
              tick={{ fill: '#787b86', fontSize: 10 }}
              tickLine={false}
              axisLine={false}
              width={48}
              domain={['auto', 'auto']}
            />
            <Tooltip
              cursor={{ stroke: '#fff', strokeOpacity: 0.2, strokeDasharray: '4 4' }}
              contentStyle={{
                background: '#0f172a',
                border: '1px solid rgba(255,255,255,0.12)',
                borderRadius: 12,
                color: '#e5e7eb',
              }}
              formatter={(value, name) => {
                if (name === 'value') return [`$${Number(value).toLocaleString(undefined, { maximumFractionDigits: 2 })}`, 'Value'];
                return [value, String(name)];
              }}
              labelFormatter={(label) => `Period ${String(label)}`}
            />
            <Area type="monotone" dataKey="high" stroke="none" fill="url(#volatilityGradient)" fillOpacity={1} />
            <Area type="monotone" dataKey="low" stroke="none" fill="url(#volatilityGradient)" fillOpacity={1} />
            <Line
              type="monotone"
              dataKey="value"
              stroke="#2962FF"
              strokeWidth={2.5}
              dot={false}
              activeDot={{ r: 4, fill: '#fff', stroke: '#2962FF', strokeWidth: 2 }}
              animationDuration={800}
            />
            <Line
              type="monotone"
              dataKey="value"
              stroke="#FFB200"
              strokeWidth={1.3}
              strokeDasharray="6 6"
              dot={false}
              connectNulls
              isAnimationActive={false}
            />
            <ReferenceLine
              y={currentValue}
              stroke="rgba(255,255,255,0.2)"
              strokeDasharray="6 6"
            />
            {lastPoint && (
              <Line
                type="monotone"
                dataKey="value"
                stroke="#ffffff"
                strokeWidth={0.8}
                dot={({ cx, cy, value }) => (
                  <circle
                    key={`dot-${String(value ?? '')}`}
                    cx={Number(cx)}
                    cy={Number(cy)}
                    r={4}
                    fill="#fff"
                    stroke="#2962FF"
                    strokeWidth={2}
                  />
                )}
                activeDot={{ r: 4, fill: '#fff', stroke: '#2962FF', strokeWidth: 2 }}
                isAnimationActive={false}
              />
            )}
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

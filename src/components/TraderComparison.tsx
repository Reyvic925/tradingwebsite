import { useEffect, useState } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { apiGet } from '../lib/api';
import type { Trader } from '../types';

type Metric = { id: number; name: string; return: number | null; drawdown: number | null; trades: number; history_days: number };
type Comparison = { metrics: Metric[]; chart: Record<string, string | number>[] };
const colors = ['#34d399', '#fbbf24', '#60a5fa'];

export default function TraderComparison({ traders }: { traders: Trader[] }) {
  const [selected, setSelected] = useState<number[]>([]);
  const [period, setPeriod] = useState(30);
  const [data, setData] = useState<Comparison | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    setData(null); setError('');
    if (selected.length) apiGet<Comparison>(`/api/trader-comparison?ids=${selected.join(',')}&period=${period}`)
      .then(data => { if (active) setData(data); }).catch(error => { if (active) setError(error.message); });
    return () => { active = false; };
  }, [selected, period]);
  return <section className="mb-6 rounded-lg border border-white/10 p-4">
    <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="font-semibold">Compare strategies</h2>
      <select aria-label="Comparison period" value={period} onChange={event => setPeriod(Number(event.target.value))} className="bg-gray-900 p-2 text-sm"><option value={30}>30 days</option><option value={90}>90 days</option></select></div>
    <p className="mt-2 text-xs text-gray-400">Choose up to three. Period returns require a full history; missing history stays unavailable. Comparison drawdown uses daily equity snapshots.</p>
    <div className="mt-3 flex max-h-32 flex-wrap gap-2 overflow-auto">{traders.map(trader => <label key={trader.id} className="flex items-center gap-2 rounded border border-white/10 px-2 py-1 text-xs">
      <input type="checkbox" checked={selected.includes(trader.id)} disabled={selected.length >= 3 && !selected.includes(trader.id)} onChange={() => setSelected(ids => ids.includes(trader.id) ? ids.filter(id => id !== trader.id) : [...ids, trader.id])} />{trader.name}</label>)}</div>
    {error && <p role="alert" className="mt-3 text-rose-300">{error}</p>}
    {selected.length > 0 && !data && !error && <p className="mt-3 text-sm text-gray-400">Loading comparison…</p>}
    {data && <><div className="mt-4 overflow-x-auto"><table className="w-full text-left text-xs"><thead><tr><th className="p-2">Trader</th><th>Period return</th><th>Max drawdown</th><th>Closed trades</th><th>Recorded history</th></tr></thead>
      <tbody>{data.metrics.map((metric, index) => <tr key={metric.id} className="border-t border-white/10"><td className="p-2" style={{ color: colors[index] }}>{metric.name}</td><td className={Number(metric.return) < 0 ? 'text-rose-300' : 'text-emerald-300'}>{metric.return === null ? 'Unavailable' : `${metric.return.toFixed(2)}%`}</td><td>{metric.drawdown === null ? 'Unavailable' : `${metric.drawdown.toFixed(2)}%`}</td><td>{metric.trades}</td><td>{metric.history_days} days</td></tr>)}</tbody></table></div>
      {data.chart.length > 1 ? <><p className="mt-4 text-xs text-gray-400">Equity indexed to 100 on the first common recorded date. Shared dates only.</p><div className="mt-3 h-64"><ResponsiveContainer width="100%" height="100%"><LineChart data={data.chart}><CartesianGrid stroke="#ffffff15"/><XAxis dataKey="date" tick={{ fontSize: 10 }}/><YAxis domain={['auto','auto']} tick={{ fontSize: 10 }}/><Tooltip contentStyle={{ background: '#111827' }}/><Legend/>{data.metrics.map((metric,index) => <Line key={metric.id} dataKey={String(metric.id)} name={metric.name} stroke={colors[index]} dot={false} connectNulls={false}/>)}</LineChart></ResponsiveContainer></div></> : <p className="mt-3 text-xs text-gray-400">Not enough overlapping history for a chart.</p>}
    </>}
  </section>;
}

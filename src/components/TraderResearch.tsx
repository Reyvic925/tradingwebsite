import { useEffect, useState } from 'react';
import { apiGet } from '../lib/api';
import { startVisibleInterval } from '../lib/visible-interval';
import { formatMoney, formatPrice } from '../lib/format';
import type { Trader } from '../types';

type Position = { symbol: string; side: string; quantity: number; currency: string; mark: number | null; notional: number | null; usd_notional: number | null; weight: number | null };
type Research = {
  sharpe: number | null; sortino: number | null; annualization: number; return_observations: number;
  first_snapshot: string | null; latest_snapshot: string | null; updated_at: string | null;
  months: { month: string; return: number | null; partial: boolean; observations: number; from: string | null; to: string | null }[];
  records: { first_trade: string | null; latest_trade: string | null; total: number; market_trades: number };
  exposure: { positions: Position[]; allocations: Position[]; gross_notional: number | null; net_notional: number | null; effective_leverage: number | null; updated_at: string | null };
};

function recordedTime(value: string | null) {
  if (!value) return 'Unavailable';
  const date = new Date(/Z$|[+-]\d{2}:?\d{2}$/i.test(value) ? value : `${value.replace(' ', 'T')}Z`);
  return Number.isFinite(date.getTime()) ? date.toLocaleString(undefined, { timeZoneName: 'short' }) : 'Unavailable';
}

export default function TraderResearch({ trader }: { trader: Trader }) {
  const [data, setData] = useState<Research | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    const refresh = async () => {
      try {
        const result = await apiGet<Research>(`/api/trader-analytics?traderId=${trader.id}`);
        if (active) { setData(result); setError(''); }
      } catch (error) {
        if (active) setError(error instanceof Error ? error.message : 'Unable to load strategy research.');
      }
    };
    const stop = startVisibleInterval(refresh, 60000);
    return () => { active = false; stop(); };
  }, [trader.id]);

  const ratio = (value: number | null) => value === null ? 'Unavailable' : value.toFixed(2);
  return <section className="mb-8 space-y-6 rounded-2xl border border-amber-200/15 bg-[#10151d] p-5 sm:p-6">
    <div>
      <h2 className="text-xl font-medium text-amber-50">Strategy research</h2>
      <p className="mt-2 text-sm text-gray-300">{trader.bio || 'Strategy description pending.'}</p>
      <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-xs text-gray-400">
        <span>Session {trader.session_type.toUpperCase()}</span>
        <span>Recorded history from {data?.first_snapshot || 'Unavailable'}</span>
        <span>Latest equity date {data?.latest_snapshot || 'Unavailable'}</span>
      </div>
    </div>
    {error && <p role="alert" className="text-sm text-amber-200">{error}</p>}
    {!data && !error && <p className="text-sm text-gray-400">Loading recorded strategy data...</p>}
    {data && <>
      <dl className="grid grid-cols-2 gap-4 border-y border-white/10 py-5 sm:grid-cols-4">
        {[['Sharpe ratio', ratio(data.sharpe)], ['Sortino ratio', ratio(data.sortino)],
          ['USD gross exposure', data.exposure.gross_notional === null ? 'Unavailable' : formatMoney(data.exposure.gross_notional)],
          ['Effective leverage', data.exposure.effective_leverage === null ? 'Unavailable' : `${data.exposure.effective_leverage.toFixed(2)}x`]].map(([label, value]) =>
          <div key={label}><dt className="text-xs text-gray-400">{label}</dt><dd className="mt-2 text-xl tabular-nums text-white">{value}</dd></div>)}
      </dl>
      <p className="text-xs leading-relaxed text-gray-400">Ratios use {data.return_observations} recorded session returns, annualized over {data.annualization} sessions with a 0% risk-free rate and downside target. At least 30 observations are required. Zero variance or zero downside leaves the corresponding ratio unavailable. Figures describe simulated strategy equity.</p>
      <div>
        <h3 className="mb-3 text-sm font-medium text-white">Monthly performance</h3>
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
          {data.months.map(month => <div key={month.month}
            title={`${month.from || 'No baseline'} to ${month.to || 'No observation'} | ${month.observations} snapshots${month.partial ? ' | Month to date' : ''}`}
            className={`rounded-lg border p-3 ${month.return === null ? 'border-white/10 bg-white/[0.02] text-gray-500' : month.return >= 0 ? 'border-emerald-300/20 bg-emerald-400/10 text-emerald-200' : 'border-rose-300/20 bg-rose-400/10 text-rose-200'}`}>
            <div className="text-[11px]">{month.month}{month.partial ? ' MTD' : ''}</div>
            <div className="mt-2 text-sm font-medium tabular-nums">{month.return === null ? 'Unavailable' : `${month.return > 0 ? '+' : ''}${month.return.toFixed(2)}%`}</div>
          </div>)}
        </div>
        <p className="mt-2 text-xs text-gray-500">Each return uses recorded month boundaries. Missing boundary data stays unavailable. MTD indicates the current partial month.</p>
      </div>
      <div>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-medium text-white">Open asset allocation</h3>
          <span className="text-xs text-gray-500">Marks as of {recordedTime(data.exposure.updated_at)}</span>
        </div>
        {data.exposure.positions.length ? <div className="overflow-x-auto"><table className="w-full text-left text-xs">
          <thead className="text-gray-400"><tr><th className="py-2 pr-4">Asset</th><th className="pr-4">Side</th><th className="pr-4">Quantity</th><th className="pr-4">Mark</th><th className="pr-4">Notional</th><th>Allocation</th></tr></thead>
          <tbody>{data.exposure.allocations.map((position, index) => <tr key={`${position.symbol}-${index}`} className="border-t border-white/10 text-gray-200">
            <td className="py-3 pr-4 font-medium">{position.symbol}</td><td className="pr-4">{position.side}</td><td className="pr-4">{position.quantity.toLocaleString(undefined, { maximumFractionDigits: 6 })}</td>
            <td className="pr-4">{position.mark === null ? 'Unavailable' : `${formatPrice(position.mark)} ${position.currency}`}</td>
            <td className="pr-4">{position.notional === null ? 'Unavailable' : `${formatPrice(position.notional)} ${position.currency}`}</td>
            <td>{position.weight === null ? 'Unavailable' : `${position.weight.toFixed(1)}%`}</td>
          </tr>)}</tbody></table></div> : <p className="text-sm text-gray-400">No recorded open positions.</p>}
        <p className="mt-3 text-xs text-gray-500">Net USD exposure {data.exposure.net_notional === null ? 'unavailable' : formatMoney(data.exposure.net_notional)}. Leverage is gross USD notional divided by strategy equity. Totals require a recorded USD conversion mark for every open asset.</p>
      </div>
      <div className="border-t border-white/10 pt-4 text-xs leading-relaxed text-gray-400">
        <p>First recorded trade {recordedTime(data.records.first_trade)}. Latest activity {recordedTime(data.records.latest_trade)}.</p>
        <p className="mt-1">{data.records.market_trades || 0} market-priced trades of {data.records.total || 0} recorded trades. Profile updated {recordedTime(data.updated_at)}.</p>
      </div>
    </>}
  </section>;
}

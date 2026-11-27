import ProfileMetric from './ProfileMetric';
import { useEffect, useState } from 'react';
import { apiGet } from '../lib/api';
import { startVisibleInterval } from '../lib/visible-interval';
import { formatMoney, formatPrice } from '../lib/format';
import type { Trader } from '../types';

type Position = { symbol: string; side: string; quantity: number; currency: string; mark: number | null; notional: number | null; usd_notional: number | null; weight: number | null };
type Performance = {
  closedTrades: number; winRate: number | null; profitFactor: number | null; expectancy: number | null;
  averageWin: number | null; averageLoss: number | null; breakevenWinRate: number | null;
  longestWinStreak: number; longestLossStreak: number;
  maxDrawdown: number; modelledTrades: number; monthsActive: number; firstTrade: string | null;
  latestTrade: string | null; finalEquity: number | null; totalReturn: number | null;
};
type Research = {
  sharpe: number | null; sortino: number | null; annualization: number; return_observations: number;
  first_snapshot: string | null; latest_snapshot: string | null; updated_at: string | null;
  months: { month: string; return: number | null; partial: boolean; observations: number; from: string | null; to: string | null }[];
  records: { first_trade: string | null; latest_trade: string | null; total: number; market_trades: number };
  performance: Performance | null;
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
  const performance = data?.performance ?? null;
  const winRateMargin = performance?.winRate !== null && performance?.winRate !== undefined && performance.breakevenWinRate !== null
    ? performance.winRate - performance.breakevenWinRate : null;
  const tradesPerMonth = performance && performance.monthsActive > 0 ? performance.closedTrades / performance.monthsActive : null;
  return <section className="mb-8 space-y-6 rounded-2xl border border-amber-200/15 bg-[#10151d] p-5 sm:p-6">
    <div>
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-xl font-medium text-amber-50">Strategy research</h2>
        <span className="rounded-full border border-amber-200/25 bg-amber-200/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-amber-200">Modelled strategy history</span>
      </div>
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
      <div role="note" className="rounded-xl border border-amber-300/25 bg-amber-300/[0.06] p-4">
        <h3 className="text-sm font-medium text-amber-100">How to read these figures</h3>
        <p className="mt-2 text-xs leading-relaxed text-amber-100/80">
          This is modelled, in-sample strategy history — not a live or audited track record. The deterministic model assumes a favourable historical drift and applies no fees, slippage, or exchange fills. Sharpe ratios above 3 and win rates above 70% are common in backtests and are widely treated as warning signs of overfitting or lookahead bias, not proof of trader skill.
        </p>
        {performance && <ul className="mt-3 space-y-1.5 text-xs leading-relaxed text-amber-100/75">
          <li>Small sample: {performance.closedTrades.toLocaleString()} closed trades over {performance.monthsActive} months{tradesPerMonth === null ? '' : ` (~${tradesPerMonth.toFixed(1)} per month)`}.</li>
          {performance.breakevenWinRate !== null && <li>
            Breakeven win rate at the observed average win and loss is ~{performance.breakevenWinRate.toFixed(1)}%{winRateMargin !== null && performance.winRate !== null
              ? `; the reported ${performance.winRate.toFixed(2)}% leaves ~${winRateMargin.toFixed(1)} points of margin` : ''}. A modest decline would erase the edge.
          </li>}
          {performance.longestWinStreak > 0 && <li>Longest win streak {performance.longestWinStreak} trades against a worst loss streak of {performance.longestLossStreak}, consistent with a favourable historical window.</li>}
        </ul>}
        <p className="mt-3 text-xs font-medium text-amber-100">Treat these figures as a hypothesis to test out-of-sample with realistic costs, not as verified live performance.</p>
      </div>
      <dl className="grid grid-cols-2 gap-4 border-y border-white/10 py-5 sm:grid-cols-4">
        {[['Sharpe ratio', 'sharpe', ratio(data.sharpe)], ['Sortino ratio', 'sortino', ratio(data.sortino)],
          ['USD gross exposure', 'gross_notional', data.exposure.gross_notional === null ? 'Unavailable' : formatMoney(data.exposure.gross_notional)],
          ['Effective leverage', 'effective_leverage', data.exposure.effective_leverage === null ? 'Unavailable' : `${data.exposure.effective_leverage.toFixed(2)}x`]].map(([label, key, value]) =>
          <div key={label}><dt className="text-xs text-gray-400">{label}</dt><dd className="mt-2 text-xl tabular-nums text-white"><ProfileMetric trader={trader} metricKey={key} format={number => key === 'gross_notional' ? formatMoney(number) : key === 'effective_leverage' ? `${number.toFixed(2)}x` : number.toFixed(2)}>{value}</ProfileMetric></dd></div>)}
      </dl>
      {data.performance && <>
        <dl className="grid grid-cols-2 gap-4 border-y border-white/10 py-5 sm:grid-cols-4">
          {[
            ['Win rate', data.performance.winRate === null ? 'Unavailable' : `${data.performance.winRate.toFixed(2)}%`],
            ['Profit factor', data.performance.profitFactor === null ? 'Unavailable' : data.performance.profitFactor.toFixed(2)],
            ['Expectancy / trade', data.performance.expectancy === null ? 'Unavailable' : formatMoney(data.performance.expectancy)],
            ['Average win', data.performance.averageWin === null ? 'Unavailable' : formatMoney(data.performance.averageWin)],
            ['Average loss', data.performance.averageLoss === null ? 'Unavailable' : formatMoney(data.performance.averageLoss)],
            ['Closed trades', data.performance.closedTrades.toLocaleString()],
            ['Best win streak', `${data.performance.longestWinStreak} trades`],
            ['Worst loss streak', `${data.performance.longestLossStreak} trades`],
            ['Max drawdown', `${data.performance.maxDrawdown.toFixed(2)}%`],
            ['Months active', `${data.performance.monthsActive}`],
            ['Modelled trades', data.performance.modelledTrades.toLocaleString()],
            ['Strategy return', data.performance.totalReturn === null ? 'Unavailable' : `${data.performance.totalReturn > 0 ? '+' : ''}${data.performance.totalReturn.toFixed(2)}%`],
          ].map(([label, value]) => <div key={label}><dt className="text-xs text-gray-400">{label}</dt><dd className="mt-2 text-xl tabular-nums text-white">{value}</dd></div>)}
        </dl>
        <p className="text-xs leading-relaxed text-gray-400">Win rate, profit factor, streaks, and drawdown are calculated from recorded trades and equity snapshots. {data.performance.modelledTrades.toLocaleString()} of {data.performance.closedTrades.toLocaleString()} closed trades are labelled as modelled strategy history.</p>
      </>}
      <p className="text-xs leading-relaxed text-gray-400">Calculated ratios use <ProfileMetric trader={trader} metricKey="return_observations">{data.return_observations}</ProfileMetric> session returns, annualized over <ProfileMetric trader={trader} metricKey="annualization">{data.annualization}</ProfileMetric> sessions with a 0% risk-free rate and downside target. At least 30 observations are required. Zero variance or zero downside leaves the corresponding ratio unavailable. Figures describe model strategy equity. These profiles represent algorithmic strategies.</p>
      <div>
        <h3 className="mb-3 text-sm font-medium text-white">Monthly performance</h3>
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
          {data.months.map(month => {
            const key = `month_${month.month.replace('-', '_')}`;
            const shownReturn = trader.profile_metrics?.[key] ?? month.return;
            return <div key={month.month}
            title={`${month.from || 'No baseline'} to ${month.to || 'No observation'} | ${month.observations} snapshots${month.partial ? ' | Month to date' : ''}`}
            className={`rounded-lg border p-3 ${shownReturn === null ? 'border-white/10 bg-white/[0.02] text-gray-500' : shownReturn >= 0 ? 'border-emerald-300/20 bg-emerald-400/10 text-emerald-200' : 'border-rose-300/20 bg-rose-400/10 text-rose-200'}`}>
            <div className="text-[11px]">{month.month}{month.partial ? ' MTD' : ''}</div>
            <div className="mt-2 text-sm font-medium tabular-nums"><ProfileMetric trader={trader} metricKey={key} format={number => `${number > 0 ? '+' : ''}${number.toFixed(2)}%`}>{month.return === null ? 'Unavailable' : `${month.return > 0 ? '+' : ''}${month.return.toFixed(2)}%`}</ProfileMetric></div>
          </div>; })}
        </div>
        <p className="mt-2 text-xs text-gray-500">Calculated returns use recorded month boundaries. Missing boundary data stays unavailable. MTD indicates the current partial month.</p>
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
        <p className="mt-3 text-xs text-gray-500">Net USD exposure <ProfileMetric trader={trader} metricKey="net_notional" format={formatMoney}>{data.exposure.net_notional === null ? 'unavailable' : formatMoney(data.exposure.net_notional)}</ProfileMetric>. Calculated leverage is gross USD notional divided by strategy equity. Totals require a recorded USD conversion mark for every open asset.</p>
      </div>
      <div className="border-t border-white/10 pt-4 text-xs leading-relaxed text-gray-400">
        <p>First recorded trade {recordedTime(data.records.first_trade)}. Latest activity {recordedTime(data.records.latest_trade)}.</p>
        <p className="mt-1"><ProfileMetric trader={trader} metricKey="market_trades">{data.records.market_trades || 0}</ProfileMetric> market-priced trades of <ProfileMetric trader={trader} metricKey="recorded_trades">{data.records.total || 0}</ProfileMetric> recorded trades. Profile updated {recordedTime(data.updated_at)}.</p>
      </div>
    </>}
  </section>;
}

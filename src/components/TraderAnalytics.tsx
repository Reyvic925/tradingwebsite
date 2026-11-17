import ProfileMetric from './ProfileMetric';
import type { Trader, TradeLog } from '../types';
import { formatMoney } from '../lib/format';

function metric(value: unknown, format: (value: number) => string) {
  if (value === null || value === undefined || value === '') return 'Unavailable';
  const number = Number(value);
  return Number.isFinite(number) ? format(number) : 'Unavailable';
}

export default function TraderAnalytics({ trader, trades, loading, error }: {
  trader: Trader;
  trades: TradeLog[];
  loading: boolean;
  error: string | null;
}) {
  const percent = (value: number) => `${value.toFixed(2)}%`;
  const count = (value: number) => value.toLocaleString();
  const reportedFormats: Record<string, (value: number) => string> = {
    daily_return: percent, monthly_return: percent, profit_sharing_fee: percent,
    under_management: formatMoney, profit_for_copiers: formatMoney,
    risk_score: value => `${value} / 10`, profit_factor: value => value.toFixed(2),
    average_closed_pnl: formatMoney, realized_pnl: formatMoney, closed_trades_analysed: count,
  };
  const closed = trades.filter(trade => trade.status === 'CLOSED' && trade.pnl != null && Number.isFinite(Number(trade.pnl)));
  const gains = closed.reduce((sum, trade) => sum + Math.max(0, Number(trade.pnl)), 0);
  const losses = closed.reduce((sum, trade) => sum + Math.max(0, -Number(trade.pnl)), 0);
  const sampleReady = !loading && !error && closed.length > 0;
  const profitFactor = losses > 0 ? (gains / losses).toFixed(2) : 'No recorded losses';
  const stats = [
    ['Daily return', 'daily_return', metric(trader.daily_return, percent)],
    ['Monthly return', 'monthly_return', metric(trader.monthly_return, percent)],
    ['Capital following', 'under_management', metric(trader.under_management, formatMoney)],
    ['Copier profit', 'profit_for_copiers', metric(trader.profit_for_copiers, formatMoney)],
    ['Performance fee', 'profit_sharing_fee', metric(trader.profit_sharing_fee, percent)],
    ['Risk score', 'risk_score', metric(trader.risk_score, value => `${value} / 10`)],
  ];
  const sampleStats = [
    ['Profit factor', 'profit_factor', sampleReady ? profitFactor : 'Unavailable'],
    ['Average closed P&L', 'average_closed_pnl', sampleReady ? formatMoney((gains - losses) / closed.length) : 'Unavailable'],
    ['Realized P&L', 'realized_pnl', sampleReady ? formatMoney(gains - losses) : 'Unavailable'],
    ['Closed trades analysed', 'closed_trades_analysed', sampleReady ? count(closed.length) : 'Unavailable'],
  ];

  return (
    <section className="mb-8 overflow-hidden rounded-2xl border border-amber-200/15 bg-gradient-to-br from-[#191b20] to-[#0b1018]">
      <div className="border-b border-white/10 px-5 py-5 sm:px-6">
        <p className="text-[10px] uppercase tracking-[0.24em] text-amber-200/70">Strategy intelligence</p>
        <h2 className="mt-2 text-xl font-medium text-white">Capital, performance & risk</h2>
        {trader.specialty && <p className="mt-2 text-sm text-gray-400">{trader.specialty}</p>}
      </div>
      <dl className="grid grid-cols-2 gap-px bg-white/10 sm:grid-cols-3">
        {stats.map(([label, key, value]) => (
          <div key={label} className="bg-[#11161e] px-5 py-5">
            <dt className="text-xs text-gray-400">{label}</dt>
            <dd className="mt-2 break-words text-lg font-medium tabular-nums text-amber-50"><ProfileMetric trader={trader} metricKey={key} format={reportedFormats[key]}>{value}</ProfileMetric></dd>
          </div>
        ))}
      </dl>
      <p className="px-5 pt-4 text-xs text-gray-400 sm:px-6">Current copiers are users with active or paused allocations.</p>
      <div className="px-5 py-5 sm:px-6">
        <h3 className="text-sm font-medium text-white">Recent trade analytics</h3>
        <p className="mt-1 text-xs text-gray-400">Calculated from the loaded closed trades. P&L uses the recorded trade values.</p>
        {error && <p className="mt-2 text-xs text-amber-200">Trade analytics could not be refreshed.</p>}
        <dl className="mt-5 grid grid-cols-2 gap-5 sm:grid-cols-4">
          {sampleStats.map(([label, key, value]) => <div key={label}><dt className="text-xs text-gray-400">{label}</dt><dd className="mt-2 font-medium tabular-nums text-white"><ProfileMetric trader={trader} metricKey={key} format={reportedFormats[key]}>{loading ? 'Loading' : value}</ProfileMetric></dd></div>)}
        </dl>
      </div>
    </section>
  );
}

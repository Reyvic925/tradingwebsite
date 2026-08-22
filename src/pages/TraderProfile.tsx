import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import AppShell from '../components/AppShell';
import { useTraderTrades, usePnlAnimation, useCopyTrading } from '../lib/copy-trading-hooks';
import {
  ChevronUp,
  ChevronDown,
  TrendingUp,
  Shield,
  Users,
  Clock,
  Plus
} from 'lucide-react';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { formatMoney } from '../lib/format';
import type { Trader, TradeLog } from '../types';

/**
 * Trader Profile Page Component
 * Shows detailed trader information, equity curve, and trade history
 */
export default function TraderProfile() {
  const { traderId } = useParams();
  const navigate = useNavigate();
  const [trader, setTrader] = useState<Trader | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedTrade, setSelectedTrade] = useState<TradeLog | null>(null);
  const { trades, error: tradesError } = useTraderTrades(traderId as string);
  const { followTrader } = useCopyTrading();
  const animatedReturn = usePnlAnimation(Number(trader?.total_return ?? 0), 1000, 2);

  // Load trader details
  useEffect(() => {
    const fetchTrader = async () => {
      try {
        setLoading(true);
        const response = await fetch(`/api/traders?id=${traderId}`);
        if (!response.ok) throw new Error('Trader not found');
        const data = await response.json();
        const traderData = Array.isArray(data) ? data[0] : data;
        if (!traderData) throw new Error('Trader not found');
        setTrader(traderData);
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        setLoading(false);
      }
    };

    if (traderId) {
      fetchTrader();
    }
  }, [traderId]);

  if (loading) {
    return (
      <AppShell>
        <div className="space-y-4">
          <div className="h-40 animate-pulse rounded-lg bg-white/5" />
          <div className="h-80 animate-pulse rounded-lg bg-white/5" />
        </div>
      </AppShell>
    );
  }

  if (error || !trader) {
    return (
      <AppShell>
        <div className="text-center py-12">
          <div className="text-lg font-semibold text-white mb-2">Trader Not Found</div>
          <p className="text-gray-400 mb-4">{error || 'This trader profile is not available'}</p>
          <button
            onClick={() => navigate('/app/social')}
            className="px-4 py-2 rounded-lg bg-blue-500 text-white hover:bg-blue-600"
          >
            Back to Social Trading
          </button>
        </div>
      </AppShell>
    );
  }

  const isProfit = trader.total_return >= 0;
  const startingEquity = 10000;
  const currentEquity = Number(trader.current_equity || startingEquity);
  const equityCurve = Array.from({ length: 7 }, (_, index) => ({
    day: index === 0 ? 'Start' : `Day ${index}`,
    equity: Number((startingEquity + ((currentEquity - startingEquity) * index) / 6).toFixed(2)),
  }));

  return (
    <AppShell>
      {/* Header Section */}
      <div className="mb-8">
        <button
          onClick={() => navigate('/app/social')}
          className="text-blue-400 hover:text-blue-300 text-sm mb-4"
        >
          ← Back to Traders
        </button>

        <div className="flex items-start justify-between">
          <div className="flex items-center gap-4">
            <img
              src={trader.avatar_url}
              alt={trader.name}
              className="h-20 w-20 rounded-full object-cover"
            />
            <div>
              <h1 className="text-3xl font-bold text-white">{trader.name}</h1>
              <p className="text-gray-400 text-sm">{trader.bio}</p>
              <div className="flex gap-4 mt-2 text-xs">
                <span className="text-gray-500">
                  Session: <span className="text-white capitalize">{trader.session_type}</span>
                </span>
                <span className="text-gray-500">
                  Risk: <span className="text-white">{trader.risk_score}/10</span>
                </span>
              </div>
            </div>
          </div>

          <button
            onClick={() => {
              // Open follow modal
              const amt = 1000;
              followTrader(trader.id, amt, {
                stopLoss: 20,
                takeProfit: 200,
                leverage: 1
              }).catch(err => alert('Failed to follow: ' + err.message));
            }}
            className="flex items-center gap-2 px-6 py-3 rounded-lg bg-emerald-500 text-white hover:bg-emerald-600 transition font-semibold"
          >
            <Plus size={18} />
            Follow Trader
          </button>
        </div>
      </div>

      {/* Key Metrics */}
      <div className="mb-8 grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="p-4 rounded-lg bg-white/5 border border-white/10">
                  <div className="text-xs text-gray-400 mb-1">Trader Equity</div>
                  <div className="text-2xl font-bold text-white">{formatMoney(trader.current_equity ?? 0)}</div>
          <div className="text-xs text-gray-500 mt-1">Starting: $10,000</div>
        </div>

        <div className="p-4 rounded-lg bg-white/5 border border-white/10">
          <div className="text-xs text-gray-400 mb-1">Total Return</div>
          <div className={`text-2xl font-bold flex items-center gap-2 ${isProfit ? 'text-emerald-400' : 'text-red-400'}`}>
            {isProfit ? '+' : ''}{animatedReturn.toFixed(2)}%
            {isProfit ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
          </div>
        </div>

        <div className="p-4 rounded-lg bg-white/5 border border-white/10">
          <div className="text-xs text-gray-400 mb-1">Win Rate</div>
          <div className="text-2xl font-bold text-white">{Number(trader.win_rate_trades || 50).toFixed(1)}%</div>
          <div className="text-xs text-gray-500 mt-1">{trader.total_trades || 0} total trades</div>
        </div>

        <div className="p-4 rounded-lg bg-white/5 border border-white/10">
          <div className="text-xs text-gray-400 mb-1">Max Drawdown</div>
          <div className="text-2xl font-bold text-red-400">{Number(trader.max_drawdown || 0).toFixed(2)}%</div>
          <div className="text-xs text-gray-500 mt-1">Peak-to-trough loss</div>
        </div>
      </div>

      {/* Secondary Metrics */}
      <div className="mb-8 grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="p-4 rounded-lg bg-blue-500/10 border border-blue-500/30">
          <div className="flex items-center gap-2 mb-2">
            <Users size={16} className="text-blue-400" />
            <div className="text-sm text-gray-300">Followers</div>
          </div>
          <div className="text-2xl font-bold text-white">{trader.followers || 0}</div>
        </div>

        <div className="p-4 rounded-lg bg-purple-500/10 border border-purple-500/30">
          <div className="flex items-center gap-2 mb-2">
            <TrendingUp size={16} className="text-purple-400" />
            <div className="text-sm text-gray-300">Daily Volatility</div>
          </div>
          <div className="text-2xl font-bold text-white">{(Number(trader.volatility || 0.005) * 100).toFixed(3)}%</div>
        </div>

        <div className="p-4 rounded-lg bg-amber-500/10 border border-amber-500/30">
          <div className="flex items-center gap-2 mb-2">
            <Shield size={16} className="text-amber-400" />
            <div className="text-sm text-gray-300">Risk Score</div>
          </div>
          <div className="text-2xl font-bold text-white">{trader.risk_score}/10</div>
        </div>
      </div>

      {/* Equity Curve */}
      <div className="mb-8 p-6 rounded-lg bg-white/5 border border-white/10">
        <h2 className="text-lg font-semibold text-white mb-4">Equity Curve (7 Days)</h2>
        <div className="h-64 rounded-lg border border-white/10 bg-white/[0.02] p-3">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={equityCurve} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="equityFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#34d399" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="#34d399" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="#ffffff" strokeOpacity={0.08} vertical={false} />
              <XAxis dataKey="day" tick={{ fill: '#9ca3af', fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis
                tick={{ fill: '#9ca3af', fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(value) => `$${Number(value).toLocaleString()}`}
                width={76}
              />
              <Tooltip
                contentStyle={{ backgroundColor: '#111827', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 8 }}
                labelStyle={{ color: '#d1d5db' }}
                formatter={(value) => [formatMoney(Number(value)), 'Equity']}
              />
              <Area type="monotone" dataKey="equity" stroke="#34d399" strokeWidth={2} fill="url(#equityFill)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Asset Focus */}
      {trader.asset_focus && trader.asset_focus.length > 0 && (
        <div className="mb-8">
          <h2 className="text-lg font-semibold text-white mb-4">Asset Focus</h2>
          <div className="flex flex-wrap gap-2">
            {trader.asset_focus.map((asset, idx) => (
              <div
                key={idx}
                className="px-4 py-2 rounded-lg bg-blue-500/10 border border-blue-500/30 text-blue-300 text-sm font-medium"
              >
                {asset}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Trading activity */}
      <div className="mb-8">
        <div className="mb-4 flex items-end justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold text-white">Trading activity</h2>
            <p className="mt-1 text-xs text-gray-500">BUY and SELL activity for {trader.name}'s configured assets</p>
          </div>
          <div className="text-right text-xs text-gray-500">{trades.length} recent trades</div>
        </div>
        <div className="space-y-2 max-h-96 overflow-y-auto">
          {typeof navigator !== 'undefined' && !navigator.onLine ? (
            <div className="rounded-lg border border-amber-400/20 bg-amber-400/5 px-4 py-6 text-center text-amber-200">
              You are offline. Trading activity will refresh when the connection returns.
            </div>
          ) : tradesError ? (
            <div className="rounded-lg border border-red-400/20 bg-red-400/5 px-4 py-6 text-center text-red-300">
              Unable to load trading activity: {tradesError}
            </div>
          ) : trades && trades.length > 0 ? (
            trades.map((trade: TradeLog) => {
              const isProfitable = (trade.pnl || 0) > 0;
              return (
                <button
                  type="button"
                  key={trade.id}
                  onClick={() => setSelectedTrade(trade)}
                  aria-label={`View ${trade.side} ${trade.symbol} trade details`}
                  className={`p-3 rounded-lg border flex items-center justify-between transition ${
                    isProfitable
                      ? 'bg-emerald-500/10 border-emerald-500/30'
                      : 'bg-red-500/10 border-red-500/30'
                  } w-full text-left hover:border-white/30`}
                >
                  <div className="flex items-center gap-3">
                    <div className={`px-3 py-1 rounded text-xs font-bold ${
                      trade.side === 'BUY'
                        ? 'bg-blue-500/30 text-blue-300'
                        : 'bg-orange-500/30 text-orange-300'
                    }`}>
                      {trade.side}
                    </div>
                    <div>
                      <div className="text-sm font-semibold text-white">
                        {Number(trade.quantity).toFixed(4)} {trade.symbol}
                      </div>
                      <div className="text-xs text-gray-500">
                        Entry: ${Number(trade.entry_price).toFixed(4)} 
                        {trade.exit_price && ` → Exit: $${Number(trade.exit_price).toFixed(4)}`}
                      </div>
                    </div>
                  </div>

                  <div className="text-right">
                    <div className={`text-sm font-bold ${isProfitable ? 'text-emerald-400' : 'text-red-400'}`}>
                      {isProfitable ? '+' : ''}{formatMoney(trade.pnl || 0)}
                    </div>
                    <div className={`text-xs ${isProfitable ? 'text-emerald-400' : 'text-red-400'}`}>
                      {isProfitable ? '+' : ''}{Number(trade.pnl_percent || 0).toFixed(2)}%
                    </div>
                    <div className="text-xs text-gray-500 mt-1">
                      {trade.status === 'CLOSED' ? 'Closed' : 'Open'}
                    </div>
                  </div>
                </button>
              );
            })
          ) : (
            <div className="text-center py-8 text-gray-400">
              <Clock size={32} className="mx-auto mb-2" />
              <p>No trades yet</p>
            </div>
          )}
        </div>
      </div>

      {selectedTrade && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={() => setSelectedTrade(null)}>
          <div
            role="dialog"
            aria-modal="true"
            aria-label={`${selectedTrade.side} ${selectedTrade.symbol} trade details`}
            className="w-full max-w-lg rounded-xl border border-white/10 bg-[#0b111a] p-6 shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4 border-b border-white/10 pb-4">
              <div>
                <div className="text-[10px] uppercase tracking-[0.2em] text-gray-500">Trade details</div>
                <h2 className="mt-1 text-xl font-bold text-white">{selectedTrade.symbol}</h2>
              </div>
              <button type="button" onClick={() => setSelectedTrade(null)} className="text-sm text-gray-400 hover:text-white">Close</button>
            </div>
            <div className="mt-5 grid grid-cols-2 gap-3 text-sm">
              <div className="rounded-lg border border-white/10 bg-white/[0.03] p-3"><div className="text-xs text-gray-500">Side</div><div className="mt-1 font-semibold text-white">{selectedTrade.side}</div></div>
              <div className="rounded-lg border border-white/10 bg-white/[0.03] p-3"><div className="text-xs text-gray-500">Status</div><div className="mt-1 font-semibold text-white">{selectedTrade.status}</div></div>
              <div className="rounded-lg border border-white/10 bg-white/[0.03] p-3"><div className="text-xs text-gray-500">Entry price</div><div className="mt-1 font-mono text-white">{formatMoney(selectedTrade.entry_price)}</div></div>
              <div className="rounded-lg border border-white/10 bg-white/[0.03] p-3"><div className="text-xs text-gray-500">Exit price</div><div className="mt-1 font-mono text-white">{selectedTrade.exit_price ? formatMoney(selectedTrade.exit_price) : 'Open'}</div></div>
              <div className="rounded-lg border border-white/10 bg-white/[0.03] p-3"><div className="text-xs text-gray-500">Quantity</div><div className="mt-1 font-mono text-white">{Number(selectedTrade.quantity).toFixed(4)}</div></div>
              <div className={`rounded-lg border p-3 ${(selectedTrade.pnl || 0) >= 0 ? 'border-emerald-400/20 bg-emerald-400/5' : 'border-rose-400/20 bg-rose-400/5'}`}><div className="text-xs text-gray-500">Profit / loss</div><div className="mt-1 font-mono text-white">{(selectedTrade.pnl || 0) >= 0 ? '+' : ''}{formatMoney(selectedTrade.pnl || 0)} ({(selectedTrade.pnl || 0) >= 0 ? '+' : ''}{Number(selectedTrade.pnl_percent || 0).toFixed(2)}%)</div></div>
            </div>
          </div>
        </div>
      )}

    </AppShell>
  );
}

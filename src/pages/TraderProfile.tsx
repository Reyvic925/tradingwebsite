import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import AppShell from '../components/AppShell';
import { useTraderTrades, usePnlAnimation, useCopyTrading } from '../lib/copy-trading-hooks';
import {
  ChevronUp,
  ChevronDown,
  TrendingUp,
  TrendingDown,
  Shield,
  Users,
  Award,
  Clock,
  ArrowRight,
  Plus
} from 'lucide-react';
import { formatMoney, formatPct } from '../lib/format';
import type { Trader, TradeLog } from '../types';

/**
 * Trader Profile Page Component
 * Shows detailed trader information, equity curve, and trade history
 */
export default function TraderProfile() {
  const { traderId } = useParams();
  const navigate = useNavigate();
  const [trader, setTrader] = useState<Trader | null>(null);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { trades } = useTraderTrades(traderId as string);
  const { followTrader } = useCopyTrading();
  const animatedReturn = usePnlAnimation(Number(trader?.total_return ?? 0), 1000, 2);

  // Load trader details
  useEffect(() => {
    const fetchTrader = async () => {
      try {
        setLoading(true);
        // You'd implement this endpoint
        // const response = await fetch(`/api/traders/${traderId}`);
        // if (!response.ok) throw new Error('Trader not found');
        // const data = await response.json();
        // setTrader(data);
        
        // For now, placeholder
        console.log('Fetch trader:', traderId);
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
            onClick={() => navigate('/social')}
            className="px-4 py-2 rounded-lg bg-blue-500 text-white hover:bg-blue-600"
          >
            Back to Social Trading
          </button>
        </div>
      </AppShell>
    );
  }

  const isProfit = trader.total_return >= 0;

  return (
    <AppShell>
      {/* Header Section */}
      <div className="mb-8">
        <button
          onClick={() => navigate('/social')}
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
                  <div className="text-xs text-gray-400 mb-1">Platform Equity</div>
                  <div className="text-2xl font-bold text-white">{formatMoney(trader.website_equity ?? trader.current_equity ?? 0)}</div>
                  <div className="mt-1 text-[11px] text-gray-500">All user accounts</div>
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

      {/* Equity Curve (Placeholder) */}
      <div className="mb-8 p-6 rounded-lg bg-white/5 border border-white/10">
        <h2 className="text-lg font-semibold text-white mb-4">Equity Curve (7 Days)</h2>
        <div className="h-64 bg-white/[0.02] rounded-lg border border-white/10 flex items-center justify-center">
          <div className="text-center">
            <TrendingUp size={32} className="mx-auto mb-2 text-gray-600" />
            <p className="text-gray-500">Chart visualization would appear here</p>
            <p className="text-gray-600 text-sm mt-1">Integration with Recharts coming soon</p>
          </div>
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

      {/* Live Trade Feed */}
      <div className="mb-8">
        <h2 className="text-lg font-semibold text-white mb-4">Live Trade Feed</h2>
        <div className="space-y-2 max-h-96 overflow-y-auto">
          {trades && trades.length > 0 ? (
            trades.map((trade: TradeLog) => {
              const isProfitable = (trade.pnl || 0) > 0;
              return (
                <div
                  key={trade.id}
                  className={`p-3 rounded-lg border flex items-center justify-between transition ${
                    isProfitable
                      ? 'bg-emerald-500/10 border-emerald-500/30'
                      : 'bg-red-500/10 border-red-500/30'
                  }`}
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
                </div>
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

      {/* Information Box */}
      <div className="p-4 rounded-lg bg-blue-500/10 border border-blue-500/30">
        <div className="text-sm text-blue-100">
          <strong>Note:</strong> All trader performance metrics are simulated for demonstration purposes. Copy trading involves real financial risk. Always set appropriate stop-loss limits and manage your risk carefully. Past simulated performance does not guarantee future results.
        </div>
      </div>
    </AppShell>
  );
}

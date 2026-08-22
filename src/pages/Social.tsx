import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import AppShell from '../components/AppShell';
import {
  useTraders,
  useLeaderboard,
  useCopyTrading,
  usePnlAnimation
} from '../lib/copy-trading-hooks';
import {
  ChevronUp,
  ChevronDown,
  Crown,
  TrendingUp,
  AlertCircle,
  Zap,
  Plus,
  X,
  Search,
  SlidersHorizontal,
  LayoutDashboard,
  BarChart3,
  Activity,
  ShieldCheck
} from 'lucide-react';
import { formatMoney, formatPct } from '../lib/format';
import { apiGet } from '../lib/api';
import { getMarketStatus } from '../lib/session-utils';
import type { Trader, UserFollow, Wallet } from '../types';

// Follow Modal Component
function FollowModal({ trader, isOpen, availableBalance, onClose, onFollow }: { trader: Trader; isOpen: boolean; availableBalance: number; onClose: () => void; onFollow: (id: string | number, amount: number, settings: Record<string, any>) => Promise<void> }) {
  const [allocation, setAllocation] = useState(1000);
  const [stopLoss, setStopLoss] = useState(20);
  const [takeProfit, setTakeProfit] = useState(200);
  const [leverage, setLeverage] = useState(1);
  const [riskProfile, setRiskProfile] = useState('Balanced');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isOpen) setAllocation(Math.min(1000, Math.max(0, availableBalance)));
  }, [availableBalance, isOpen]);

  const handleFollow = async () => {
    if (availableBalance < 100) {
      alert('You need at least $100 available balance to copy a trader.');
      return;
    }
    if (allocation > availableBalance) {
      alert('Allocation cannot exceed your available balance.');
      return;
    }
    try {
      setLoading(true);
      await onFollow(trader.id, allocation, {
        stopLoss,
        takeProfit,
        leverage
      });
      onClose();
    } catch (error) {
      console.error('Follow error:', error);
      alert(error instanceof Error ? error.message : 'Failed to follow trader');
    } finally {
      setLoading(false);
    }
  };

  const chooseRisk = (profile: 'Conservative' | 'Balanced' | 'Aggressive') => {
    setRiskProfile(profile);
    if (profile === 'Conservative') {
      setStopLoss(10);
      setTakeProfit(100);
      setLeverage(0.5);
    } else if (profile === 'Aggressive') {
      setStopLoss(30);
      setTakeProfit(300);
      setLeverage(2);
    } else {
      setStopLoss(20);
      setTakeProfit(200);
      setLeverage(1);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4 backdrop-blur-sm sm:items-center">
      <div className="my-auto max-h-[calc(100vh-2rem)] w-full max-w-md overflow-y-auto rounded-lg border border-white/10 bg-gray-900 p-6">
        <div className="flex items-start justify-between mb-4">
          <div>
            <div className="text-[10px] uppercase tracking-[0.2em] text-amber-300/70">Continuous copy</div>
            <h2 className="mt-1 text-xl font-bold text-white">Copy {trader.name}</h2>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition"
          >
            <X size={20} />
          </button>
        </div>

        <div className="mb-6 p-4 rounded-lg bg-white/5 border border-white/10">
          <div className="text-sm text-gray-400 mb-1">Available balance</div>
          <div className="text-2xl font-bold text-emerald-400">
            {formatMoney(availableBalance)}
          </div>
          <div className="text-sm text-gray-500 mt-1">
            Live ROI: <span className={trader.total_return >= 0 ? 'text-emerald-400' : 'text-red-400'}>
              {trader.total_return >= 0 ? '+' : ''}{Number(trader.total_return).toFixed(2)}%
            </span>
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-lg border border-emerald-400/15 bg-emerald-400/5 px-3 py-2 text-xs text-emerald-100">
            Copying stays active until you stop it or a risk limit closes it. There is no fixed term or maturity date.
          </div>

          <div>
            <label className="text-sm text-gray-300 block mb-2">
              Starting balance: <span className="text-emerald-400">{formatMoney(allocation)}</span>
            </label>
            <input
              type="range"
              min="100"
              max={Math.max(100, availableBalance)}
              step="100"
              value={allocation}
              onChange={(e) => setAllocation(Number(e.target.value))}
              className="w-full"
            />
            <div className="flex justify-between text-xs text-gray-500 mt-1">
              <span>$100</span>
              <span>{formatMoney(availableBalance)}</span>
            </div>
          </div>

          <div>
            <div className="mb-2 text-sm text-gray-300">Risk appetite</div>
            <div className="grid grid-cols-3 gap-2">
              {(['Conservative', 'Balanced', 'Aggressive'] as const).map((profile) => (
                <button
                  key={profile}
                  type="button"
                  onClick={() => chooseRisk(profile)}
                  className={`rounded-md border px-2 py-2 text-xs transition ${riskProfile === profile ? 'border-emerald-400 bg-emerald-400/15 text-emerald-200' : 'border-white/10 bg-white/5 text-gray-400 hover:border-white/25'}`}
                >
                  {profile}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-sm text-gray-300 block mb-2">Maximum drawdown (%)</label>
            <input
              type="number"
              min="5"
              max="100"
              value={stopLoss}
              onChange={(e) => setStopLoss(Number(e.target.value))}
              className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white text-sm"
            />
          </div>

          <div>
            <label className="text-sm text-gray-300 block mb-2">Profit target (%)</label>
            <input
              type="number"
              min="10"
              max="1000"
              value={takeProfit}
              onChange={(e) => setTakeProfit(Number(e.target.value))}
              className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white text-sm"
            />
          </div>

          <div>
            <label className="text-sm text-gray-300 block mb-2">Trade size multiplier</label>
            <select
              value={leverage}
              onChange={(e) => setLeverage(Number(e.target.value))}
              className="w-full px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-white text-sm"
            >
              <option value={0.5}>0.5x</option>
              <option value={1}>1x</option>
              <option value={2}>2x</option>
            </select>
          </div>
        </div>

        <div className="mt-6 flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 rounded-lg bg-white/5 text-white hover:bg-white/10 transition text-sm font-semibold"
          >
            Cancel
          </button>
          <button
            onClick={handleFollow}
            disabled={loading || availableBalance < 100}
            className="flex-1 px-4 py-2 rounded-lg bg-emerald-500 text-white hover:bg-emerald-600 disabled:opacity-50 transition text-sm font-semibold"
          >
            {loading ? 'Starting copy...' : availableBalance < 100 ? 'Insufficient balance' : 'Start copying'}
          </button>
        </div>
      </div>
    </div>
  );
}

// Leaderboard Section
function LeaderboardSection() {
  const { leaderboard, loading } = useLeaderboard();

  if (loading) {
    return <div className="h-40 animate-pulse rounded-lg bg-white/5" />;
  }

  return (
    <div className="mb-8">
      <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
        <Crown size={20} className="text-yellow-500" />
        Top Traders
      </h2>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {((leaderboard as any[]) || []).slice(0, 3).map((trader: any, idx: number) => (
          <div
            key={trader.id}
            className={`p-4 rounded-lg border backdrop-blur-sm transition ${
              trader.medal === 'gold'
                ? 'bg-yellow-500/10 border-yellow-500/30'
                : trader.medal === 'silver'
                ? 'bg-gray-400/10 border-gray-400/30'
                : 'bg-orange-500/10 border-orange-500/30'
            }`}
          >
            <div className="flex items-start justify-between mb-3">
              <div className="flex items-center gap-2">
                <Link to={`/app/trader/${trader.id}`} aria-label={`View ${trader.name} profile`} className="shrink-0" onClick={(event) => event.stopPropagation()}>
                  <img
                    src={trader.avatar_url}
                    alt={trader.name}
                    className="h-10 w-10 rounded-full object-cover"
                  />
                </Link>
                <div>
                  <Link to={`/app/trader/${trader.id}`} className="text-sm font-semibold text-white hover:text-emerald-300" onClick={(event) => event.stopPropagation()}>
                    {trader.name}
                  </Link>
                  <div className="text-xs text-gray-400">{idx + 1}. {trader.medal === 'gold' ? '🥇 Gold' : trader.medal === 'silver' ? '🥈 Silver' : '🥉 Bronze'}</div>
                </div>
              </div>
            </div>
            <div className="text-2xl font-bold text-emerald-400 mb-2">
              {formatPct(Number(trader.total_return || 0))}
            </div>
            <div className="mb-3 text-[10px] uppercase tracking-widest text-gray-500">30-day ROI</div>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="text-gray-400">Win rate: <span className="text-white font-semibold">{Number(trader.win_rate_trades || 0).toFixed(1)}%</span></div>
              <div className="text-gray-400">Copiers: <span className="text-white font-semibold">{trader.followers || 0}</span></div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// Portfolio Summary Banner
function PortfolioSummary() {
  const { summary } = useCopyTrading();
  const animatedPnL = usePnlAnimation(summary.total_pnl, 1000, 2);

  const isPositive = summary.total_pnl >= 0;
  const profitPercentage = Math.min(
    (Math.abs(summary.total_pnl_percent) / 200) * 100,
    100
  );

  return (
    <div className="mb-8 p-6 rounded-lg bg-gradient-to-r from-blue-500/10 to-purple-500/10 border border-white/10">
      <h2 className="text-lg font-semibold text-white mb-4">Your Copy Portfolio</h2>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
        <div>
          <div className="text-xs uppercase tracking-widest text-gray-400 mb-1">Total Invested</div>
          <div className="text-2xl font-bold text-white">{formatMoney(summary.total_invested)}</div>
        </div>
        <div>
          <div className="text-xs uppercase tracking-widest text-gray-400 mb-1">Current Value</div>
          <div className="text-2xl font-bold text-white">{formatMoney(summary.total_current)}</div>
        </div>
        <div>
          <div className="text-xs uppercase tracking-widest text-gray-400 mb-1">Total PnL</div>
          <div className={`text-2xl font-bold flex items-center gap-2 ${isPositive ? 'text-emerald-400' : 'text-red-400'}`}>
            {formatMoney(animatedPnL)}
            {isPositive ? <ChevronUp size={20} /> : <ChevronDown size={20} />}
          </div>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="mb-4">
        <div className="flex justify-between text-xs mb-1">
          <span className="text-gray-400">Profit Progress</span>
          <span className={isPositive ? 'text-emerald-400' : 'text-red-400'}>
            {summary.total_pnl_percent >= 0 ? '+' : ''}{Number(summary.total_pnl_percent).toFixed(2)}%
          </span>
        </div>
        <div className="h-2 bg-white/5 rounded-full overflow-hidden">
          <div
            className={`h-full transition-all duration-1000 ${
              isPositive ? 'bg-emerald-500' : 'bg-red-500'
            }`}
            style={{ width: `${profitPercentage}%` }}
          />
        </div>
      </div>

      <div className="text-xs text-gray-400">
        {summary.count} {summary.count === 1 ? 'trader' : 'traders'} copied
      </div>
    </div>
  );
}

// Trader Card Component
function TraderCard({ trader, availableBalance, onFollow }: { trader: Trader; availableBalance: number; onFollow: (id: string | number, amount: number, settings: Record<string, any>) => Promise<void> }) {
  const [showModal, setShowModal] = useState<boolean>(false);
  const [, refreshStatus] = useState(Date.now());
  const isProfit = trader.total_return >= 0;

  useEffect(() => {
    const interval = window.setInterval(() => refreshStatus(Date.now()), 60000);
    return () => window.clearInterval(interval);
  }, []);

  const getSessionBadge = (sessionType: string) => {
    const badges: Record<string, any> = {
      sydney: { emoji: '🌅', label: 'Sydney' },
      asia: { emoji: '🌙', label: 'Asia' },
      tokyo: { emoji: '🗾', label: 'Tokyo' },
      london: { emoji: '🇬🇧', label: 'London' },
      nyc: { emoji: '🗽', label: 'NYC' },
      crypto: { emoji: '🔗', label: '24/7 Crypto' }
    };
    return badges[sessionType] || badges.nyc;
  };

  const badge = getSessionBadge(trader.session_type);
  const marketStatus = getMarketStatus(trader.session_type);
  const sessionOpen = marketStatus.status === 'Live';

  return (
    <>
      <div
        className={`rounded-lg border p-5 backdrop-blur-sm transition hover:border-white/30 ${
          isProfit
            ? 'bg-emerald-500/5 border-emerald-500/20'
            : 'bg-red-500/5 border-red-500/20'
        }`}
      >
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3">
            <img
              src={trader.avatar_url}
              alt={trader.name}
              className="h-12 w-12 rounded-full object-cover"
            />
            <div>
              <Link to={`/app/trader/${trader.id}`} className="text-sm font-semibold text-white hover:text-emerald-300">
                {trader.name}
              </Link>
              <div className="text-xs text-gray-500">{badge.emoji} {badge.label}</div>
              <div className={`mt-1 text-[10px] uppercase tracking-wider ${sessionOpen ? 'text-emerald-400' : 'text-gray-500'}`}>
                <span className={`mr-1 inline-block h-1.5 w-1.5 rounded-full ${sessionOpen ? 'bg-emerald-400' : 'bg-gray-600'}`} />
                {sessionOpen ? 'Open' : 'Closed'}
              </div>
            </div>
          </div>
        </div>

        <p className="text-xs text-gray-400 mb-3 line-clamp-2">{trader.bio}</p>

        {/* Asset Focus Pills */}
        {trader.asset_focus && trader.asset_focus.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-3">
            {(trader.asset_focus as string[]).slice(0, 3).map((asset: string, idx: number) => (
              <span
                key={idx}
                className="px-2 py-1 rounded-full bg-white/10 text-xs text-gray-300"
              >
                #{asset.split('-')[0]}
              </span>
            ))}
            {trader.asset_focus.length > 3 && (
              <span className="px-2 py-1 text-xs text-gray-400">+{trader.asset_focus.length - 3}</span>
            )}
          </div>
        )}

        {/* Metrics */}
        <div className="grid grid-cols-3 gap-2 mb-4 text-center text-xs">
          <div>
            <div className={`font-mono font-bold ${isProfit ? 'text-emerald-400' : 'text-red-400'}`}>
              {formatPct(Number(trader.total_return || 0))}
            </div>
            <div className="text-gray-500">30-day ROI</div>
          </div>
          <div>
            <div className="font-mono font-bold text-white">{Number(trader.win_rate_trades || 50).toFixed(0)}%</div>
            <div className="text-gray-500">Win Rate</div>
          </div>
          <div>
            <div className="font-mono font-bold text-white">{trader.followers || 0}</div>
            <div className="text-gray-500">Copiers</div>
          </div>
        </div>

        <button
          onClick={() => setShowModal(true)}
          className="w-full py-2 rounded-lg bg-emerald-500 text-white hover:bg-emerald-600 transition text-sm font-semibold flex items-center justify-center gap-2"
        >
          <Plus size={16} />
          Copy Trader
        </button>
      </div>

      <FollowModal
        trader={trader}
        availableBalance={availableBalance}
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        onFollow={onFollow}
      />
    </>
  );
}

function CopyDetailModal({ follow, onClose, onEdit, onStop }: { follow: UserFollow; onClose: () => void; onEdit: () => void; onStop: () => void }) {
  const isProfit = Number(follow.pnl_percent || 0) >= 0;
  const nearStopLoss = Number(follow.pnl_percent || 0) <= -(Number(follow.stop_loss_percent || 20) * 0.8);
  const trader = follow.trader;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 p-4 backdrop-blur-sm sm:items-center">
      <div role="dialog" aria-modal="true" aria-label={`${trader?.name || 'Copy position'} details`} className="my-auto max-h-[calc(100vh-2rem)] w-full max-w-2xl overflow-y-auto rounded-xl border border-white/10 bg-[#0b111a] p-5 shadow-2xl sm:p-7">
        <div className="flex items-start justify-between gap-4 border-b border-white/10 pb-5">
          <div className="flex items-center gap-3">
            <img src={trader?.avatar_url} alt={trader?.name} className="h-14 w-14 rounded-full object-cover ring-2 ring-emerald-400/30" />
            <div>
              <div className="text-[10px] uppercase tracking-[0.2em] text-emerald-300/70">Active copy</div>
              <h2 className="mt-1 text-2xl font-bold text-white">{trader?.name || 'Copy position'}</h2>
              <div className="mt-1 text-xs text-gray-500">Running continuously · no fixed term</div>
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label="Close copy details" className="text-gray-400 transition hover:text-white"><X size={20} /></button>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-lg border border-white/10 bg-white/[0.03] p-4"><div className="text-[10px] uppercase tracking-widest text-gray-500">Current value</div><div className="mt-2 font-mono text-xl text-white">{formatMoney(follow.current_value)}</div></div>
          <div className="rounded-lg border border-white/10 bg-white/[0.03] p-4"><div className="text-[10px] uppercase tracking-widest text-gray-500">Allocated</div><div className="mt-2 font-mono text-xl text-white">{formatMoney(follow.allocated_amount)}</div></div>
          <div className={`rounded-lg border p-4 ${isProfit ? 'border-emerald-400/20 bg-emerald-400/5' : 'border-rose-400/20 bg-rose-400/5'}`}><div className="text-[10px] uppercase tracking-widest text-gray-500">P&L</div><div className={`mt-2 font-mono text-xl ${isProfit ? 'text-emerald-300' : 'text-rose-300'}`}>{isProfit ? '+' : ''}{formatMoney(follow.pnl)}</div></div>
          <div className={`rounded-lg border p-4 ${isProfit ? 'border-emerald-400/20 bg-emerald-400/5' : 'border-rose-400/20 bg-rose-400/5'}`}><div className="text-[10px] uppercase tracking-widest text-gray-500">Return</div><div className={`mt-2 font-mono text-xl ${isProfit ? 'text-emerald-300' : 'text-rose-300'}`}>{isProfit ? '+' : ''}{Number(follow.pnl_percent || 0).toFixed(2)}%</div></div>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          <div className="rounded-lg border border-white/10 bg-white/[0.03] p-4"><div className="flex items-center gap-2 text-[10px] uppercase tracking-widest text-gray-500"><ShieldCheck size={14} /> Risk controls</div><div className="mt-3 grid grid-cols-2 gap-3 text-sm"><div><div className="text-xs text-gray-500">Max drawdown</div><div className="mt-1 font-mono text-white">-{Number(follow.stop_loss_percent || 20).toFixed(0)}%</div></div><div><div className="text-xs text-gray-500">Profit target</div><div className="mt-1 font-mono text-white">+{Number(follow.take_profit_percent || 200).toFixed(0)}%</div></div></div></div>
          <div className="rounded-lg border border-white/10 bg-white/[0.03] p-4"><div className="flex items-center gap-2 text-[10px] uppercase tracking-widest text-gray-500"><Activity size={14} /> Copy settings</div><div className="mt-3 grid grid-cols-2 gap-3 text-sm"><div><div className="text-xs text-gray-500">Trade multiplier</div><div className="mt-1 font-mono text-white">{Number(follow.leverage_multiplier || 1).toFixed(1)}x</div></div><div><div className="text-xs text-gray-500">Status</div><div className="mt-1 font-mono text-emerald-300">Copying</div></div></div></div>
        </div>

        {nearStopLoss && <div className="mt-4 flex items-center gap-2 rounded-lg border border-amber-400/20 bg-amber-400/10 px-4 py-3 text-sm text-amber-200"><AlertCircle size={16} /> This copy is approaching its maximum drawdown.</div>}

        <div className="mt-6 flex flex-wrap justify-end gap-2 border-t border-white/10 pt-5">
          <button type="button" onClick={onEdit} className="rounded-md bg-white/5 px-4 py-2 text-xs font-semibold text-gray-200 transition hover:bg-white/10">Edit risk</button>
          <button type="button" onClick={onStop} className="rounded-md bg-rose-500/10 px-4 py-2 text-xs font-semibold text-rose-300 transition hover:bg-rose-500/20">Stop copying</button>
        </div>
      </div>
    </div>
  );
}

// My Positions Section
function MyPositions() {
  const { follows, stopCopying, loading } = useCopyTrading();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [selectedFollow, setSelectedFollow] = useState<UserFollow | null>(null);

  if (loading) {
    return <div className="h-40 animate-pulse rounded-lg bg-white/5" />;
  }

  if (follows.length === 0) {
    return (
      <div className="p-8 rounded-lg border border-dashed border-white/20 text-center">
        <TrendingUp size={32} className="mx-auto mb-3 text-gray-600" />
        <div className="text-sm text-gray-400">No active positions. Start copying a trader!</div>
      </div>
    );
  }

  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
      {((follows as any[]) || []).map((follow: UserFollow) => {
        const isProfit = (follow.pnl_percent || 0) >= 0;
        const nearStopLoss =
          (follow.pnl_percent || 0) <= -(follow.stop_loss_percent * 0.8);

        return (
          <div
            key={follow.id}
            role="button"
            tabIndex={0}
            onClick={() => setSelectedFollow(follow)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                setSelectedFollow(follow);
              }
            }}
            className="cursor-pointer rounded-lg border border-white/10 bg-white/[0.02] p-4 transition hover:border-amber-400/30 hover:bg-white/[0.04] focus:border-amber-400/50 focus:outline-none"
          >
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-3">
                <Link to={`/app/trader/${follow.trader_id}`} aria-label={`View ${follow.trader?.name || 'trader'} profile`} className="shrink-0" onClick={(event) => event.stopPropagation()}>
                  <img
                    src={follow.trader?.avatar_url}
                    alt={follow.trader?.name}
                    className="h-10 w-10 rounded-full object-cover"
                  />
                </Link>
                <div>
                  <Link to={`/app/trader/${follow.trader_id}`} className="text-sm font-semibold text-white hover:text-emerald-300" onClick={(event) => event.stopPropagation()}>
                    {follow.trader?.name}
                  </Link>
                  <div className="text-xs text-gray-500">
                    {formatMoney(follow.allocated_amount)} allocated
                  </div>
                </div>
              </div>

              <div className="text-right">
                <div className={`text-sm font-bold ${isProfit ? 'text-emerald-400' : 'text-red-400'}`}>
                  {isProfit ? '+' : ''}{formatMoney(follow.pnl)}
                </div>
                <div className={`text-xs ${isProfit ? 'text-emerald-400' : 'text-red-400'}`}>
                  {isProfit ? '+' : ''}{Number(follow.pnl_percent || 0).toFixed(2)}%
                </div>
              </div>
            </div>

            {/* Risk Indicators */}
            <div className="mb-3 flex items-center gap-2 text-xs">
              {nearStopLoss && (
                <div className="flex items-center gap-1 text-amber-400 bg-amber-500/10 px-2 py-1 rounded">
                  <AlertCircle size={14} />
                  <span>⚠️ Approaching Stop-Loss</span>
                </div>
              )}
              <div className="text-gray-500">
                SL: -{follow.stop_loss_percent}% | TP: +{follow.take_profit_percent}%
              </div>
            </div>

            {/* Current Value */}
            <div className="mb-3 text-xs text-gray-400">
              Current Value: <span className="text-white font-semibold">{formatMoney(follow.current_value)}</span>
            </div>

            {/* Actions */}
            <div className="flex gap-2">
              <button
                onClick={(event) => { event.stopPropagation(); setEditingId(editingId === follow.id ? null : follow.id); }}
                className="text-xs px-3 py-1 rounded-lg bg-white/5 text-gray-300 hover:bg-white/10 transition"
              >
                {editingId === follow.id ? 'Done' : 'Edit Risk'}
              </button>
              <button
                onClick={(event) => {
                  event.stopPropagation();
                  if (confirm('Stop copying this trader?')) {
                    stopCopying(follow.id);
                  }
                }}
                className="text-xs px-3 py-1 rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20 transition"
              >
                Stop
              </button>
            </div>

            {/* Edit Form (shown when editing) */}
            {editingId === follow.id && (
              <div onClick={(event) => event.stopPropagation()}><EditFollowForm follow={follow} onClose={() => setEditingId(null)} /></div>
            )}
          </div>
        );
      })}
      {selectedFollow && (
        <CopyDetailModal
          follow={selectedFollow}
          onClose={() => setSelectedFollow(null)}
          onEdit={() => { setSelectedFollow(null); setEditingId(selectedFollow.id); }}
          onStop={() => {
            if (confirm('Stop copying this trader?')) {
              void stopCopying(selectedFollow.id);
              setSelectedFollow(null);
            }
          }}
        />
      )}
    </div>
  );
}

// Edit Follow Form Component
function EditFollowForm({ follow, onClose }: { follow: UserFollow; onClose: () => void }) {
  const [stopLoss, setStopLoss] = useState<number>(follow.stop_loss_percent);
  const [takeProfit, setTakeProfit] = useState<number>(follow.take_profit_percent);
  const [leverage, setLeverage] = useState<number>(follow.leverage_multiplier);
  const { updateFollow } = useCopyTrading();
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    try {
      setSaving(true);
      await updateFollow(follow.id, {
        stopLoss,
        takeProfit,
        leverage
      });
      onClose();
    } catch {
      alert('Failed to update settings');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mt-3 p-3 rounded-lg bg-white/5 border border-white/10 space-y-2">
      <div>
        <label className="text-xs text-gray-400 block mb-1">Stop Loss (%)</label>
        <input
          type="number"
          value={stopLoss}
          onChange={(e) => setStopLoss(Number(e.target.value))}
          className="w-full px-2 py-1 rounded bg-white/10 border border-white/20 text-white text-xs"
        />
      </div>
      <div>
        <label className="text-xs text-gray-400 block mb-1">Take Profit (%)</label>
        <input
          type="number"
          value={takeProfit}
          onChange={(e) => setTakeProfit(Number(e.target.value))}
          className="w-full px-2 py-1 rounded bg-white/10 border border-white/20 text-white text-xs"
        />
      </div>
      <div>
        <label className="text-xs text-gray-400 block mb-1">Leverage</label>
        <select
          value={leverage}
          onChange={(e) => setLeverage(Number(e.target.value))}
          className="w-full px-2 py-1 rounded bg-white/10 border border-white/20 text-white text-xs"
        >
          <option value={1}>1x</option>
          <option value={2}>2x</option>
          <option value={3}>3x</option>
          <option value={5}>5x</option>
        </select>
      </div>
      <div className="flex gap-2">
        <button
          onClick={handleSave}
          disabled={saving}
          className="flex-1 px-2 py-1 text-xs rounded bg-emerald-500 text-white hover:bg-emerald-600 disabled:opacity-50"
        >
          {saving ? 'Saving...' : 'Save'}
        </button>
      </div>
    </div>
  );
}

// Main Social Component
export default function Social() {
  const { traders, loading: tradersLoading } = useTraders();
  const { followTrader } = useCopyTrading();
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [view, setView] = useState<'discover' | 'leaderboard' | 'dashboard'>('discover');
  const [query, setQuery] = useState('');
  const [sortBy, setSortBy] = useState<'popular' | 'return' | 'winRate'>('popular');
  const [showFilters, setShowFilters] = useState(false);

  useEffect(() => {
    apiGet<Wallet>('/api/wallet').then(setWallet).catch(() => setWallet(null));
  }, []);

  const visibleTraders = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    const filtered = ((traders as any[]) || []).filter((trader: Trader) => {
      if (!normalizedQuery) return true;
      return [trader.name, trader.bio, trader.specialty, ...(trader.asset_focus || [])]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(normalizedQuery));
    });

    return [...filtered].sort((first: Trader, second: Trader) => {
      if (sortBy === 'return') return Number(second.total_return) - Number(first.total_return);
      if (sortBy === 'winRate') return Number(second.win_rate_trades) - Number(first.win_rate_trades);
      return Number(second.followers || 0) - Number(first.followers || 0);
    });
  }, [query, sortBy, traders]);

  return (
    <AppShell>
      <div className="mb-8 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="mb-2 text-xs uppercase tracking-[0.24em] text-amber-300/70">Social desk / 01</div>
          <h1 className="mb-2 text-3xl font-bold text-white sm:text-4xl">Copy Trading</h1>
          <p className="max-w-2xl text-sm text-gray-400">
            Discover disciplined lead traders, compare their live track records, and copy a strategy with risk controls that stay in your hands.
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs text-stone-400">
          <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-400" />
          Live strategies updating
        </div>
      </div>

      <div className="mb-8 flex flex-wrap gap-2 border-b border-white/10 pb-3">
        {[
          { id: 'discover', label: 'Discover', icon: Search },
          { id: 'leaderboard', label: 'Leaderboard', icon: BarChart3 },
          { id: 'dashboard', label: 'Copier dashboard', icon: LayoutDashboard },
        ].map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => setView(id as typeof view)}
            className={`flex items-center gap-2 rounded-sm px-3 py-2 text-xs font-semibold uppercase tracking-[0.12em] transition ${view === id ? 'bg-amber-400 text-[#1a1304]' : 'text-stone-400 hover:bg-white/5 hover:text-white'}`}
          >
            <Icon size={14} />
            {label}
          </button>
        ))}
      </div>

      {view === 'dashboard' && (
        <>
          <PortfolioSummary />
          <h2 className="mb-4 mt-10 flex items-center gap-2 text-lg font-semibold text-white">
            <TrendingUp size={20} className="text-emerald-500" />
            Your active copies
          </h2>
          <MyPositions />
        </>
      )}

      {view === 'leaderboard' && (
        <>
          <PortfolioSummary />
          <LeaderboardSection />
        </>
      )}

      {view === 'discover' && (
        <>
          <PortfolioSummary />
          <div className="mb-5 flex flex-col gap-3 rounded-md border border-white/10 bg-white/[0.02] p-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="relative w-full sm:max-w-sm">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-500" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search traders or assets"
                className="w-full rounded-sm border border-white/10 bg-black/30 py-2 pl-9 pr-3 text-sm text-white outline-none placeholder:text-stone-600 focus:border-amber-400/60"
              />
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => setShowFilters((current) => !current)} className="flex items-center gap-2 rounded-sm border border-white/10 px-3 py-2 text-xs text-stone-300 hover:border-amber-400/50">
                <SlidersHorizontal size={14} /> Filters
              </button>
              <select value={sortBy} onChange={(event) => setSortBy(event.target.value as typeof sortBy)} className="rounded-sm border border-white/10 bg-[#0b0f16] px-3 py-2 text-xs text-stone-300 outline-none">
                <option value="popular">Most followed</option>
                <option value="return">Highest return</option>
                <option value="winRate">Highest win rate</option>
              </select>
            </div>
          </div>
          {showFilters && <div className="mb-5 rounded-md border border-amber-400/20 bg-amber-400/5 px-4 py-3 text-xs text-amber-100">Showing active strategies. Use the sort menu to compare popularity, return, or win rate.</div>}

          <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-white">
            <Zap size={20} className="text-yellow-500" />
            Available traders <span className="text-xs font-normal text-stone-500">{visibleTraders.length} strategies</span>
          </h2>
          {tradersLoading ? (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {[1, 2, 3, 4, 5, 6].map((i) => <div key={i} className="h-64 animate-pulse rounded-lg bg-white/5" />)}
            </div>
          ) : visibleTraders.length > 0 ? (
            <div className="mb-8 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {visibleTraders.map((trader: Trader) => <TraderCard key={trader.id} trader={trader} availableBalance={Number(wallet?.available || 0)} onFollow={followTrader} />)}
            </div>
          ) : (
            <div className="rounded-md border border-dashed border-white/15 py-12 text-center text-sm text-stone-500">No strategies match that search.</div>
          )}
        </>
      )}

    </AppShell>
  );
}

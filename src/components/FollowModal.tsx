import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { formatMoney, formatPct } from '../lib/format';
import type { Trader } from '../types';

// Follow Modal Component
export default function FollowModal({ trader, isOpen, availableBalance, onClose, onFollow }: { trader: Trader; isOpen: boolean; availableBalance: number; onClose: () => void; onFollow: (id: string | number, amount: number, settings: Record<string, any>) => Promise<unknown> }) {
  const [allocation, setAllocation] = useState(1000);
  const [stopLoss, setStopLoss] = useState(20);
  const [takeProfit, setTakeProfit] = useState(200);
  const [leverage, setLeverage] = useState(1);
  const [riskProfile, setRiskProfile] = useState('Balanced');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (isOpen) setAllocation(Math.min(1000, Math.max(0, availableBalance)));
  }, [availableBalance, isOpen]);

  const handleFollow = async () => {
    setError('');
    if (!Number.isFinite(allocation) || allocation < 100 || allocation > availableBalance) { setError('Enter an allocation between $100 and your available balance.'); return; }
    if (!Number.isFinite(stopLoss) || stopLoss < 5 || stopLoss > 100 || !Number.isFinite(takeProfit) || takeProfit < 10 || takeProfit > 1000) { setError('Drawdown must be 5-100% and profit target 10-1000%.'); return; }
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
      setError(error instanceof Error ? error.message : 'Failed to follow trader');
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
      <div role="dialog" aria-modal="true" aria-label={`Copy ${trader.name}`} className="my-auto max-h-[calc(100vh-2rem)] w-full max-w-md overflow-y-auto rounded-lg border border-white/10 bg-gray-900 p-6">
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
            Total return: <span className={Number(trader.total_return) >= 0 ? "text-emerald-400" : "text-rose-400"}>
              {formatPct(Number(trader.total_return) || 0)}
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
              step="0.01"
              value={allocation}
              onChange={(e) => setAllocation(Number(e.target.value))}
              className="w-full"
            />
            <input aria-label="Allocation amount" type="number" min="100" max={availableBalance} step="0.01" value={allocation} onChange={event => setAllocation(Number(event.target.value))} className="mt-2 w-full rounded border border-white/10 bg-black/30 p-2 text-sm" />
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
            <label className="text-sm text-gray-300 block mb-2">Maximum drawdown from peak (%)</label>
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

        <div className="mt-4 rounded border border-white/10 p-3 text-xs text-gray-300">
          <p>Reserve {formatMoney(allocation)} / {leverage}x trade size.</p>
          <p className="mt-2">Initial drawdown trigger: {formatMoney(allocation * (1 - stopLoss / 100))}. The trigger rises with peak equity. Execution can occur below it.</p>
          <p className="mt-2">Profit target: {formatMoney(allocation * (1 + takeProfit / 100))}. Performance fee: {Number(trader.profit_sharing_fee || 0)}% of new profits above the previous high.</p>
        </div>
        {error && <p role="alert" className="mt-3 text-sm text-rose-300">{error}</p>}
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

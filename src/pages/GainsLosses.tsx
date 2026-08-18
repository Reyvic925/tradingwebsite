import React, { useEffect, useMemo, useState } from 'react';
import { apiGet } from '../lib/api';
import { formatMoney } from '../lib/format';
import PrimaryPerformanceChart from '../components/PrimaryPerformanceChart';

type InvestmentGain = {
  id: number;
  planName?: string;
  fundName?: string;
  initialAmount?: number;
  currentValue?: number;
  roi?: number;
  startDate?: string;
  endDate?: string;
  status?: string;
  roiWithdrawalPending?: boolean;
  roiWithdrawalConfirmed?: boolean;
  lastTransactions?: Array<{ id?: number; type?: string; amount?: number; description?: string; created_at?: string; logged_at?: string }>;
};

export default function GainsLosses() {
  const [investments, setInvestments] = useState<InvestmentGain[]>([]);
  const [tab, setTab] = useState<'gains' | 'losses'>('gains');
  const [selectedId, setSelectedId] = useState<number | null>(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const data = await apiGet<{ investments?: InvestmentGain[] }>('/api/portfolio');
        if (!mounted) return;
        setInvestments((data?.investments || []).filter((item) => Number(item.currentValue ?? item.initialAmount ?? 0) > 0));
      } catch (err) {
        console.error(err);
      }
    })();
    return () => { mounted = false; };
  }, []);

  const filtered = useMemo(() => {
    const items = investments.map((item) => {
      const principal = Number(item.initialAmount || 0);
      const current = Number(item.currentValue ?? principal);
      const pnl = current - principal;
      return { ...item, pnl, roi: Number(item.roi || 0) };
    });

    return {
      gains: items.filter((item) => item.pnl > 0),
      losses: items.filter((item) => item.pnl < 0),
    };
  }, [investments]);

  const list = tab === 'gains' ? filtered.gains : filtered.losses;
  const selected = list.find((item) => item.id === selectedId) ?? null;

  return (
    <div className="p-4">
      <h2 className="text-xl font-semibold mb-4">Gains & Losses</h2>
      <div className="mb-4 flex gap-2">
        <button className={`px-3 py-1 rounded ${tab === 'gains' ? 'bg-blue-500 text-white' : 'bg-gray-100 text-gray-800'}`} onClick={() => setTab('gains')}>Gains ({filtered.gains.length})</button>
        <button className={`px-3 py-1 rounded ${tab === 'losses' ? 'bg-blue-500 text-white' : 'bg-gray-100 text-gray-800'}`} onClick={() => setTab('losses')}>Losses ({filtered.losses.length})</button>
      </div>

      <div className="space-y-3">
        {list.length === 0 && <div className="text-sm text-gray-500">No investments in this tab</div>}
        {list.map((item) => {
          const principal = Number(item.initialAmount || 0);
          const current = Number(item.currentValue ?? principal);
          const pnl = current - principal;
          return (
            <div key={item.id} className="rounded-md border border-white/10 bg-[#0a0f17] p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="font-medium text-white">{item.planName || item.fundName || 'Investment'} </div>
                  <div className="text-sm text-stone-400">Principal {formatMoney(principal)} • Current {formatMoney(current)}</div>
                </div>
                <div className="text-right">
                  <div className={`${pnl >= 0 ? 'text-emerald-300' : 'text-red-300'} font-semibold`}>{formatMoney(pnl)}</div>
                  <div className="text-xs uppercase tracking-[0.18em] text-stone-500">ROI {Number(item.roi || 0).toFixed(2)}%</div>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <button className="rounded bg-gray-100 px-2 py-1 text-xs font-medium text-gray-900" onClick={() => setSelectedId(item.id)}>Performance chart</button>
                <button
                  className="rounded border border-emerald-400/40 bg-emerald-500/10 px-2 py-1 text-xs font-medium text-emerald-200 disabled:cursor-not-allowed disabled:opacity-40"
                  onClick={() => window.location.assign('/app/wallet')}
                  disabled={item.roiWithdrawalPending || item.roiWithdrawalConfirmed}
                >
                  {item.roiWithdrawalPending ? 'Withdrawal pending' : item.roiWithdrawalConfirmed ? 'Withdrawn' : 'Withdraw ROI'}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="max-h-[90vh] w-full max-w-4xl overflow-auto rounded-xl border border-white/10 bg-[#0b0f17] p-4">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-lg font-medium text-white">Performance chart</h3>
              <button className="rounded bg-white/5 px-2 py-1 text-sm text-stone-300" onClick={() => setSelectedId(null)}>Close</button>
            </div>
            <PrimaryPerformanceChart
              investment={{
                id: selected.id,
                plan_id: 0,
                plan_name: selected.planName || selected.fundName || 'Investment',
                amount: Number(selected.initialAmount || 0),
                daily_rate: 0,
                duration_days: Math.max(1, Math.round((new Date(selected.endDate || Date.now()).getTime() - new Date(selected.startDate || Date.now()).getTime()) / 86400000)),
                start_date: selected.startDate || new Date().toISOString(),
                end_date: selected.endDate || new Date().toISOString(),
                status: selected.status || 'active',
                earned: Number(selected.currentValue ?? selected.initialAmount ?? 0) - Number(selected.initialAmount || 0),
              }}
              plan={{
                id: selected.id,
                name: selected.planName || selected.fundName || 'Investment',
                tagline: '',
                min_amount: Number(selected.initialAmount || 0),
                max_amount: null,
                daily_rate: 0,
                duration_days: Math.max(1, Math.round((new Date(selected.endDate || Date.now()).getTime() - new Date(selected.startDate || Date.now()).getTime()) / 86400000)),
                total_return: Number(selected.roi || 0),
                featured: false,
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}

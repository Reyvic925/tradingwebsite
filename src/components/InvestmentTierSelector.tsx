import { useEffect, useState } from 'react';
import { apiList, apiSend } from '../lib/api';
import { formatMoney } from '../lib/format';
import type { InvestmentTier } from '../types';

interface InvestmentTierSelectorProps {
  wallet_available: number;
  onInvestmentCreated?: () => void;
}

export default function InvestmentTierSelector({ wallet_available, onInvestmentCreated }: InvestmentTierSelectorProps) {
  const [tiers, setTiers] = useState<InvestmentTier[]>([]);
  const [amount, setAmount] = useState<Record<number, string>>({});
  const [msg, setMsg] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<number | null>(null);

  const load = async () => {
    try {
      setLoading(true);
      const tiersData = await apiList<InvestmentTier>('/api/investment-tiers');
      if (Array.isArray(tiersData)) {
        setTiers(tiersData);
      } else if (tiersData && typeof tiersData === 'object' && Array.isArray(Object.values(tiersData)[0])) {
        const tiers = Object.values(tiersData)[0] as unknown[];
        setTiers(tiers as InvestmentTier[]);
      }
    } catch (e: unknown) {
      setMsg(e instanceof Error ? e.message : 'Failed to load investment tiers');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const invest = async (tier: InvestmentTier) => {
    const amt = Number(amount[tier.id || 0] || tier.min_investment);
    if (amt < tier.min_investment) return setMsg(`Minimum is $${tier.min_investment}`);
    if (amt > tier.max_investment) return setMsg(`Maximum is $${tier.max_investment}`);
    if (amt > wallet_available) return setMsg(`Insufficient balance. You have $${wallet_available}`);

    setBusy(tier.id || null);
    setMsg('');
    try {
      await apiSend('/api/investments', 'POST', { tier_id: tier.id, amount: amt });
      setMsg(`Invested ${formatMoney(amt)} in ${tier.name} tier`);
      setAmount((s) => ({ ...s, [(tier.id || 0)]: '' }));
      onInvestmentCreated?.();
    } catch (e: unknown) {
      setMsg(e instanceof Error ? e.message : 'Investment creation failed');
    } finally {
      setBusy(null);
    }
  };

  return (
    <div>
      <h2 className="text-sm uppercase tracking-[0.18em] text-stone-400">Investment tiers</h2>
      {msg && <div className="mt-4 rounded-sm border border-amber-400/20 bg-amber-400/5 px-3 py-2 text-sm text-amber-100">{msg}</div>}
      {loading && <div className="mt-4 h-32 animate-pulse rounded-md bg-white/5" />}
      <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {tiers.map((tier) => (
          <div key={tier.id} className="rounded-md border border-white/8 bg-white/[0.02] p-4">
            <div className="font-display text-xl">{tier.name}</div>
            <div className="text-xs text-stone-500">{tier.duration_days} days</div>
            <div className="mt-3 font-display text-3xl text-amber-200">{tier.percent_return}%</div>
            <div className="text-[10px] uppercase tracking-widest text-stone-500">total return</div>
            <div className="mt-3 text-xs text-stone-400">
              ${Number(tier.min_investment).toLocaleString()} – ${Number(tier.max_investment).toLocaleString()}
            </div>
            <input
              type="number"
              value={amount[tier.id || 0] ?? String(tier.min_investment)}
              onChange={(e) => setAmount((s) => ({ ...s, [(tier.id || 0)]: e.target.value }))}
              className="mt-3 w-full rounded-sm border border-white/10 bg-black/40 px-2 py-2 font-mono text-xs outline-none"
            />
            <button
              disabled={busy === (tier.id || null) || loading}
              onClick={() => invest(tier)}
              className="mt-2 w-full rounded-sm bg-amber-400 py-2 text-xs font-semibold uppercase tracking-widest text-[#1a1304] disabled:opacity-60"
            >
              {busy === (tier.id || null) ? 'Investing…' : 'Invest'}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import AppShell from '../components/AppShell';
import InvestmentModal from '../components/InvestmentModal';
import InvestmentTierSelector from '../components/InvestmentTierSelector';
import { apiGet, apiList, apiSend, asList } from '../lib/api';
import { formatMoney } from '../lib/format';
import type { Investment, Plan, Wallet } from '../types';

export default function Invest() {
  const navigate = useNavigate();
  const [plans, setPlans] = useState<Plan[]>([]);
  const [investments, setInvestments] = useState<Investment[]>([]);
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [amount, setAmount] = useState<Record<number, string>>({});
  const [msg, setMsg] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<number | null>(null);
  const [selectedInvestment, setSelectedInvestment] = useState<Investment | null>(null);

  const load = async (showLoading = true) => {
    try {
      if (showLoading) setLoading(true);
      const [p, i, w] = await Promise.all([
        apiList<Plan>('/api/plans'),
        apiList<Investment>('/api/investments'),
        apiGet<Wallet>('/api/wallet').catch(() => null),
      ]);
      setPlans(asList(p));
      setInvestments(asList(i));
      if (w) setWallet(w);
    } catch (e: unknown) {
      setMsg(e instanceof Error ? e.message : 'Failed to load plans');
    } finally {
      if (showLoading) setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    const timer = setInterval(() => { void load(false); }, 10000);
    return () => clearInterval(timer);
  }, []);

  const subscribe = async (plan: Plan) => {
    const amt = Number(amount[plan.id] || plan.min_amount);
    if (amt < Number(plan.min_amount)) return setMsg(`Minimum is $${plan.min_amount}`);
    if (plan.max_amount && amt > Number(plan.max_amount)) return setMsg(`Maximum is $${plan.max_amount}`);
    setBusy(plan.id);
    setMsg('');
    try {
      await apiSend('/api/investments', 'POST', { plan_id: plan.id, amount: amt });
      setMsg(`Allocated ${formatMoney(amt)} to ${plan.name}`);
      load();
    } catch (e: unknown) {
      setMsg(e instanceof Error ? e.message : 'Subscription failed');
    } finally {
      setBusy(null);
    }
  };

  return (
    <AppShell>
      <div className="flex items-end justify-between">
        <div>
          <div className="text-[11px] uppercase tracking-[0.24em] text-amber-300/70">Yield desk</div>
          <h1 className="font-display text-4xl">Investment plans</h1>
        </div>
        <div className="text-right">
          <div className="text-[10px] uppercase tracking-widest text-stone-500">Available</div>
          <div className="font-mono text-amber-200">{formatMoney(Number(wallet?.available || 0))}</div>
        </div>
      </div>
      {msg && <div className="mt-4 rounded-sm border border-amber-400/20 bg-amber-400/5 px-3 py-2 text-sm text-amber-100">{msg}</div>}
      {loading && <div className="mt-8 h-48 animate-pulse rounded-md bg-white/5" />}
      <div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {plans.map((p) => (
          <div key={p.id} className={`rounded-md border p-5 ${p.featured ? 'border-amber-300/35 bg-amber-400/5' : 'border-white/8 bg-white/[0.02]'}`}>
            <div className="font-display text-2xl">{p.name}</div>
            <div className="text-xs text-stone-500">{p.tagline}</div>
            <div className="mt-4 font-display text-4xl text-amber-200">{p.total_return}%</div>
            <div className="text-[10px] uppercase tracking-widest text-stone-500">{p.duration_days} day cycle · total return</div>
            <div className="mt-4 text-sm text-stone-400">
              ${Number(p.min_amount).toLocaleString()}{p.max_amount ? ` – $${Number(p.max_amount).toLocaleString()}` : '+'}
            </div>
            <input
              value={amount[p.id] ?? String(p.min_amount)}
              onChange={(e) => setAmount((s) => ({ ...s, [p.id]: e.target.value }))}
              className="mt-4 w-full rounded-sm border border-white/10 bg-black/40 px-3 py-2 font-mono text-sm outline-none"
            />
            <button
              disabled={busy === p.id}
              onClick={() => subscribe(p)}
              className="mt-3 w-full rounded-sm bg-amber-400 py-2 text-xs font-semibold uppercase tracking-widest text-[#1a1304] disabled:opacity-60"
            >
              {busy === p.id ? 'Allocating…' : 'Subscribe'}
            </button>
          </div>
        ))}
      </div>

      {/* Investment Tier Selector */}
      <div className="mt-12">
        <InvestmentTierSelector 
          wallet_available={Number(wallet?.available || 0)} 
          onInvestmentCreated={() => void load(false)}
        />
      </div>

      <h2 className="mt-12 text-sm uppercase tracking-[0.18em] text-stone-400">Your allocations</h2>
      <div className="mt-4 overflow-x-auto rounded-md border border-white/5">
        <div className="hidden md:block">
          <table className="w-full min-w-[680px] text-left text-sm">
            <thead className="text-[10px] uppercase tracking-widest text-stone-500">
              <tr>
                <th className="px-5 py-3">Plan</th>
                <th className="px-3 py-3">Principal</th>
                <th className="px-3 py-3">Accrued</th>
                <th className="px-3 py-3">Ends</th>
                <th className="px-5 py-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {investments.map((i) => (
                <tr
                  key={i.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => navigate(`/app/invest/${i.id}`)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      navigate(`/app/invest/${i.id}`);
                    }
                  }}
                  className="cursor-pointer border-t border-white/5 transition-all duration-200 hover:bg-white/5 focus:bg-white/5 focus:outline-none"
                  aria-label={`Open investment details for ${i.plan_name}`}
                >
                  <td className="px-5 py-3">
                    <div className="flex items-center justify-between gap-3">
                      <span>{i.plan_name}</span>
                      <span className="inline-flex items-center rounded-full border border-amber-400/25 bg-amber-400/10 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.2em] text-amber-200">
                        Open
                      </span>
                    </div>
                  </td>
                  <td className="px-3 py-3 font-mono">{formatMoney(Number(i.amount))}</td>
                  <td className="px-3 py-3 font-mono text-emerald-400">{formatMoney(Number(i.earned))}</td>
                  <td className="px-3 py-3 text-stone-500">{new Date(i.end_date).toLocaleDateString()}</td>
                  <td className="px-5 py-3 capitalize text-amber-200">{i.status}</td>
                </tr>
              ))}
              {!investments.length && (
                <tr><td colSpan={5} className="px-5 py-8 text-center text-stone-500">No active plans.</td></tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="space-y-3 p-3 md:hidden">
          {investments.map((i) => (
            <button
              key={i.id}
              type="button"
              onClick={() => navigate(`/app/invest/${i.id}`)}
              className="w-full rounded-md border border-white/5 bg-white/[0.02] p-3 text-left transition hover:bg-white/5"
              aria-label={`Open investment details for ${i.plan_name}`}
            >
              <div className="flex items-center justify-between gap-3">
                <span className="font-medium text-white">{i.plan_name}</span>
                <span className="inline-flex items-center rounded-full border border-amber-400/25 bg-amber-400/10 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.2em] text-amber-200">
                  {i.status}
                </span>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-stone-400">
                <div>
                  <div className="text-[9px] uppercase tracking-widest text-stone-500">Principal</div>
                  <div className="mt-1 font-mono text-stone-200">{formatMoney(Number(i.amount))}</div>
                </div>
                <div>
                  <div className="text-[9px] uppercase tracking-widest text-stone-500">Accrued</div>
                  <div className="mt-1 font-mono text-emerald-400">{formatMoney(Number(i.earned))}</div>
                </div>
                <div className="col-span-2">
                  <div className="text-[9px] uppercase tracking-widest text-stone-500">Ends</div>
                  <div className="mt-1 text-stone-200">{new Date(i.end_date).toLocaleDateString()}</div>
                </div>
              </div>
            </button>
          ))}
          {!investments.length && (
            <div className="px-3 py-8 text-center text-stone-500">No active plans.</div>
          )}
        </div>
      </div>

      {/* Investment Detail Modal */}
      {selectedInvestment && (
        <InvestmentModal
          investment={selectedInvestment}
          plan={plans.find((p) => p.id === selectedInvestment.plan_id) || null}
          onClose={() => setSelectedInvestment(null)}
          onRefresh={() => { void load(false); }}
        />
      )}
    </AppShell>
  );
}

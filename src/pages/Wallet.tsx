import { useEffect, useState } from 'react';
import AppShell from '../components/AppShell';
import { apiGet, apiList, apiSend, asList } from '../lib/api';
import { formatMoney } from '../lib/format';
import type { Txn, Wallet as WalletT } from '../types';

const SUPPORTED_CRYPTOS = ['BTC','ETH','USDT','USDC','BNB','SOL','XRP','ADA','DOGE','MATIC'];

export default function Wallet() {
  const [wallet, setWallet] = useState<WalletT | null>(null);
  const [txns, setTxns] = useState<Txn[]>([]);
  const [type, setType] = useState<'deposit' | 'withdrawal'>('deposit');
  const [amount, setAmount] = useState('500');
  const [currency, setCurrency] = useState('USDT');
  const [withdrawAddress, setWithdrawAddress] = useState('');
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [depositAddresses, setDepositAddresses] = useState<{ id: number; currency: string; address: string }[]>([]);

  const load = async () => {
    try {
      const [w, t, addresses] = await Promise.all([
        apiGet<WalletT>('/api/wallet').catch(() => null),
        apiList<Txn>('/api/transactions'),
        apiList<{ id: number; currency: string; address: string }>('/api/user/crypto-addresses').catch(() => []),
      ]);
      if (w) setWallet(w);
      setTxns(asList(t));
      setDepositAddresses(asList(addresses));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const amt = Number(amount);
    if (!(amt > 0)) return setError('Enter a valid amount');
    if (type === 'withdrawal' && !withdrawAddress.trim()) {
      return setError('Please enter a destination address for withdrawal');
    }
    setBusy(true);
    setError('');
    setMsg('');
    try {
      if (type === 'deposit') {
        // Request a new deposit address for the chosen currency
        const res = await apiSend('/api/user/deposit/crypto', 'POST', { currency }) as any;
        const address = res?.address || res?.data?.address;
        if (!address) {
          setError('Failed to generate deposit address');
        } else {
          setMsg(`Deposit address for ${currency}: ${address}. Send ${currency} to this address to fund your account.`);
          // Refresh the list of addresses
          const updated = await apiList<{ id: number; currency: string; address: string }>('/api/user/crypto-addresses');
          setDepositAddresses(asList(updated));
        }
      } else {
        // Withdrawal to an external address
        await apiSend('/api/user/withdraw/crypto', 'POST', {
          currency,
          amount: amt,
          address: withdrawAddress,
        });
        setMsg(`Withdrawal of ${formatMoney(amt)} ${currency} to ${withdrawAddress} initiated.`);
        load(); // refresh wallet & txns
        setWithdrawAddress('');
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Transfer failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <AppShell>
      <div className="text-[11px] uppercase tracking-[0.24em] text-amber-300/70">Treasury</div>
      <h1 className="font-display text-4xl">Wallet</h1>

      {loading && <div className="mt-8 h-32 animate-pulse rounded-md bg-white/5" />}

      <div className="mt-8 grid gap-4 md:grid-cols-3">
        {[
          { l: 'Available', v: formatMoney(Number(wallet?.available || 0)) },
          { l: 'Reserved / margin', v: formatMoney(Number(wallet?.reserved || 0)) },
          { l: 'Equity', v: formatMoney(Number(wallet?.equity ?? 0)) },
        ].map((c) => (
          <div key={c.l} className="rounded-md border border-white/5 p-5">
            <div className="text-[10px] uppercase tracking-widest text-stone-500">{c.l}</div>
            <div className="mt-2 font-display text-3xl">{c.v}</div>
          </div>
        ))}
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        {/* Deposit / Withdraw form */}
        <form onSubmit={submit} className="rounded-md border border-white/5 p-5">
          <div className="grid grid-cols-2 gap-1 rounded-sm bg-black/40 p-1">
            <button
              type="button"
              onClick={() => { setType('deposit'); setCurrency('USDT'); setWithdrawAddress(''); }}
              className={`py-2 text-xs uppercase tracking-widest ${type === 'deposit' ? 'bg-amber-400 text-[#1a1304]' : 'text-stone-500'}`}
            >
              Deposit
            </button>
            <button
              type="button"
              onClick={() => { setType('withdrawal'); setCurrency('USDT'); }}
              className={`py-2 text-xs uppercase tracking-widest ${type === 'withdrawal' ? 'bg-amber-400 text-[#1a1304]' : 'text-stone-500'}`}
            >
              Withdraw
            </button>
          </div>

          <label className="mt-4 block text-[10px] uppercase tracking-widest text-stone-500">Amount</label>
          <input
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="mt-1 w-full rounded-sm border border-white/10 bg-black/40 px-3 py-2 font-mono outline-none"
          />

          <label className="mt-4 block text-[10px] uppercase tracking-widest text-stone-500">Currency</label>
          <select
            value={currency}
            onChange={(e) => setCurrency(e.target.value)}
            className="mt-1 w-full rounded-sm border border-white/10 bg-black/40 px-3 py-2 text-sm outline-none"
          >
            {SUPPORTED_CRYPTOS.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>

          {type === 'withdrawal' && (
            <>
              <label className="mt-4 block text-[10px] uppercase tracking-widest text-stone-500">
                Destination Address (external wallet)
              </label>
              <input
                value={withdrawAddress}
                onChange={(e) => setWithdrawAddress(e.target.value)}
                placeholder="0x... or bc1..."
                className="mt-1 w-full rounded-sm border border-white/10 bg-black/40 px-3 py-2 font-mono text-sm outline-none"
              />
            </>
          )}

          {error && <div className="mt-3 text-sm text-rose-300">{error}</div>}
          {msg && <div className="mt-3 text-sm text-emerald-300">{msg}</div>}

          <button
            disabled={busy}
            className="mt-5 w-full rounded-sm bg-amber-400 py-2.5 text-xs font-semibold uppercase tracking-widest text-[#1a1304]"
          >
            {busy ? 'Processing…' : type === 'deposit' ? 'Generate Deposit Address' : 'Request Withdrawal'}
          </button>
          <p className="mt-3 text-[11px] text-stone-600">
            {type === 'deposit'
              ? 'You will receive a unique address for this currency. Send funds to that address.'
              : 'Withdrawals are processed after manual review (simulated).'}
          </p>
        </form>

        {/* Transaction list */}
        <div className="rounded-md border border-white/5">
          <div className="border-b border-white/5 px-5 py-3 text-xs uppercase tracking-[0.18em] text-stone-500">
            Recent Transactions
          </div>
          <div className="max-h-[420px] divide-y divide-white/5 overflow-auto">
            {txns.filter((t) => t.type === 'deposit' || t.type === 'withdrawal').map((t) => (
              <div key={t.id} className="flex items-center justify-between px-5 py-3 text-sm">
                <div>
                  <div className="capitalize">{t.type} · {t.method || t.currency}</div>
                  <div className="text-[11px] text-stone-500">{t.reference}</div>
                </div>
                <div className={`font-mono ${(t.type as string) === 'deposit' ? 'text-emerald-400' : 'text-rose-300'}`}>
                  {(t.type as string) === 'deposit' ? '+' : '−'}{formatMoney(Number(t.amount))}
                </div>
              </div>
            ))}
            {!txns.some((t) => t.type === 'deposit' || t.type === 'withdrawal') && (
              <div className="px-5 py-8 text-sm text-stone-500">No cash activity.</div>
            )}
          </div>
        </div>
      </div>

      {/* Display existing deposit addresses (optional) */}
      {depositAddresses.length > 0 && (
        <div className="mt-8 rounded-md border border-white/5 p-5">
          <div className="text-[10px] uppercase tracking-widest text-stone-500">Your Deposit Addresses</div>
          <div className="mt-2 space-y-2">
            {depositAddresses.map((item) => (
              <div key={item.id} className="flex items-center gap-3 text-sm">
                <span className="w-16 font-medium">{item.currency}</span>
                <code className="flex-1 truncate rounded bg-black/40 px-2 py-1 font-mono text-xs text-amber-200/80">
                  {item.address}
                </code>
                <button
                  onClick={() => navigator.clipboard.writeText(item.address)}
                  className="text-xs text-amber-400/70 hover:text-amber-400"
                >
                  Copy
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </AppShell>
  );
}

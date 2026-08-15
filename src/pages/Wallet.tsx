import { useEffect, useState, type FormEvent } from 'react';
import { QRCodeCanvas } from 'qrcode.react';
import AppShell from '../components/AppShell';
import { apiGet, apiList, apiSend, asList } from '../lib/api';
import { formatMoney } from '../lib/format';
import type { Txn, Wallet as WalletT, Profile as ProfileT } from '../types';

// Fallback - will be replaced by config from API
const FALLBACK_SUPPORTED_CRYPTOS = ['BTC', 'ETH', 'USDT', 'USDC', 'BNB', 'SOL', 'XRP', 'ADA', 'DOGE', 'MATIC'];

type DepositAddress = { id: number; currency: string; network?: string; address: string };

export default function Wallet() {
  const [wallet, setWallet] = useState<WalletT | null>(null);
  const [profile, setProfile] = useState<ProfileT | null>(null);
  const [txns, setTxns] = useState<Txn[]>([]);
  const [type, setType] = useState<'deposit' | 'withdrawal'>('deposit');
  const [amount, setAmount] = useState('500');
  const [currency, setCurrency] = useState('USDT');
  const [withdrawAddress, setWithdrawAddress] = useState('');
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [depositAddresses, setDepositAddresses] = useState<DepositAddress[]>([]);
  const [coinQuery, setCoinQuery] = useState('');
  const [copied, setCopied] = useState(false);
  const [supportedCryptos, setSupportedCryptos] = useState<string[]>(FALLBACK_SUPPORTED_CRYPTOS);

  const load = async () => {
    try {
      const [w, p, t, addresses, config] = await Promise.all([
        apiGet<WalletT>('/api/wallet').catch(() => null),
        apiGet<{ profile: ProfileT }>('/api/profile').then(r => r.profile).catch(() => null),
        apiList<Txn>('/api/transactions'),
        apiList<DepositAddress>('/api/user/crypto-addresses').catch(() => []),
        fetch('/api/app-config?key=supported_cryptos').then(r => r.json()).catch(() => null),
      ]);
      if (w) setWallet(w);
      if (p) setProfile(p);
      setTxns(asList(t));
      const uniqueAddresses = addresses.reduce<DepositAddress[]>((acc, item) => {
        const key = `${item.currency}|${item.network || ''}|${item.address}`;
        const alreadyPresent = acc.some((existing) => `${existing.currency}|${existing.network || ''}|${existing.address}` === key);
        if (!alreadyPresent) acc.push(item);
        return acc;
      }, []);
      setDepositAddresses(uniqueAddresses);
      if (config?.value && Array.isArray(config.value)) {
        setSupportedCryptos(config.value);
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const amt = Number(amount);
    if (!(amt > 0)) return setError('Enter a valid amount');
    if (type === 'withdrawal' && !withdrawAddress.trim()) {
      return setError('Please enter a destination address for withdrawal');
    }

    // KYC gate: withdrawals require verified KYC
    if (type === 'withdrawal' && profile?.kyc_status !== 'verified') {
      return setError('KYC verification required before withdrawing. Please complete KYC in the KYC section.');
    }

    setBusy(true);
    setError('');
    setMsg('');

    try {
      if (type === 'deposit') {
        setMsg('Deposit addresses are assigned automatically to the account and are listed below.');
        await load();
        return;
      }

      await apiSend('/api/user/withdraw/crypto', 'POST', {
        currency,
        amount: amt,
        address: withdrawAddress,
      });
      setMsg(`Withdrawal of ${formatMoney(amt)} ${currency} to ${withdrawAddress} initiated.`);
      load();
      setWithdrawAddress('');
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
          { label: 'Available', value: formatMoney(Number(wallet?.available || 0)) },
          { label: 'Reserved / margin', value: formatMoney(Number(wallet?.reserved || 0)) },
          { label: 'Equity', value: formatMoney(Number(wallet?.equity ?? 0)) },
        ].map((c) => (
          <div key={c.label} className="rounded-md border border-white/5 p-5">
            <div className="text-[10px] uppercase tracking-widest text-stone-500">{c.label}</div>
            <div className="mt-2 font-display text-3xl">{c.value}</div>
          </div>
        ))}
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <form onSubmit={submit} className="rounded-md border border-white/5 p-5">
          <div className="grid grid-cols-2 gap-1 rounded-sm bg-black/40 p-1">
            <button
              type="button"
              onClick={() => {
                setType('deposit');
                setCurrency('USDT');
                setWithdrawAddress('');
              }}
              className={`py-2 text-xs uppercase tracking-widest ${type === 'deposit' ? 'bg-amber-400 text-[#1a1304]' : 'text-stone-500'}`}
            >
              Deposit
            </button>
            <button
              type="button"
              onClick={() => {
                setType('withdrawal');
                setCurrency('USDT');
              }}
              className={`py-2 text-xs uppercase tracking-widest ${type === 'withdrawal' ? 'bg-amber-400 text-[#1a1304]' : 'text-stone-500'}`}
            >
              Withdraw
            </button>
          </div>

         {/* Deposit flow: Binance-like coin selector and QR/address card */}
         {type === 'deposit' ? (
           <>
             <label className="mt-4 block text-[10px] uppercase tracking-widest text-stone-500">Coin</label>
             <input
               value={coinQuery}
               onChange={(e) => setCoinQuery(e.target.value)}
               placeholder="Search coin (e.g. USDT, BTC)"
               className="mt-1 w-full rounded-sm border border-white/10 bg-black/40 px-3 py-2 text-sm outline-none"
             />

             <div className="mt-2 grid grid-cols-2 gap-2">
               {supportedCryptos.filter((c) => c.toLowerCase().includes(coinQuery.toLowerCase())).map((c) => (
                 <button
                   key={c}
                   type="button"
                   onClick={() => setCurrency(c)}
                   className={`rounded-sm border p-2 text-sm ${currency === c ? 'border-amber-400 bg-amber-400/10' : 'border-white/10'}`}
                 >
                   <div className="font-medium">{c}</div>
                   <div className="text-xs text-stone-500">{c}</div>
                 </button>
               ))}
             </div>

             <div className="mt-4 rounded-sm border border-white/10 bg-black/20 p-3">
               <div className="mb-3 rounded bg-amber-400/10 px-3 py-2 text-xs text-amber-300">Send only {currency} to this address on the selected network. Deposits via other networks may result in loss of funds.</div>

               {/* Address / QR card */}
               <div className="flex flex-col items-center gap-4">
                 {depositAddresses.length === 0 && (
                   <div className="text-sm text-stone-500">Generating deposit address…</div>
                 )}

                 {depositAddresses.length > 0 && (
                   (() => {
                     const addr = depositAddresses.find((a) => a.currency === currency);
                     const address = addr?.address || '';
                     const network = addr?.network || 'network';
                     return (
                       <div className="w-full max-w-md rounded-md bg-white p-4 text-center">
                         <div className="bg-white p-4 rounded-md inline-block">
                           <QRCodeCanvas value={address || ' '} size={200} bgColor={'#ffffff'} fgColor={'#000000'} />
                         </div>
                         <div className="mt-3 font-mono text-sm break-all text-stone-900">{address || 'No address assigned'}</div>

                         <div className="mt-3 flex w-full items-center justify-center gap-2">
                           <button
                             type="button"
                             onClick={() => {
                               if (!address) return;
                               navigator.clipboard.writeText(address);
                               setCopied(true);
                               setTimeout(() => setCopied(false), 2500);
                             }}
                             className="rounded-sm bg-amber-400 px-4 py-2 text-sm font-semibold text-[#1a1304]"
                           >
                             {copied ? 'Copied' : 'Copy Address'}
                           </button>
                         </div>

                         <div className="mt-3 text-xs text-stone-500">Minimum deposit: 0.0001 {currency} · Credited after network confirmation · Address remains the same</div>
                       </div>
                     );
                   })()
                 )}
               </div>

               {/* Deposit history */}
               <div className="mt-4">
                 <div className="text-[10px] uppercase tracking-widest text-stone-500">Recent Deposits</div>
                 <div className="mt-2 space-y-2">
                   {txns.filter((t) => t.type === 'deposit' && t.currency === currency).slice(0,5).map((t) => (
                     <div key={t.id} className="flex items-center justify-between rounded-sm border border-white/5 p-2">
                       <div>
                         <div className="text-sm">{t.method || t.currency}</div>
                         <div className="text-xs text-stone-500">{t.reference}</div>
                       </div>
                       <div className="font-mono text-emerald-400">+{formatMoney(Number(t.amount))}</div>
                     </div>
                   ))}
                   {!txns.some((t) => t.type === 'deposit' && t.currency === currency) && (
                     <div className="text-sm text-stone-500">No recent deposits for {currency}.</div>
                   )}
                 </div>
               </div>
             </div>
           </>
         ) : (
           <>
             {profile?.kyc_status !== 'verified' && (
               <div className="mb-4 rounded border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-200">
                 <strong>KYC Required:</strong> Complete identity verification before withdrawing. Go to <a href="/app/kyc" className="underline">KYC section</a>.
               </div>
             )}
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
               {supportedCryptos.map((c) => (
                 <option key={c} value={c}>{c}</option>
               ))}
             </select>

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
           disabled={busy && type === 'withdrawal'}
           className="mt-5 w-full rounded-sm bg-amber-400 py-2.5 text-xs font-semibold uppercase tracking-widest text-[#1a1304] disabled:cursor-not-allowed disabled:opacity-60"
         >
           {busy ? 'Processing…' : type === 'withdrawal' ? 'Request Withdrawal' : 'Refresh Addresses'}
         </button>
         <p className="mt-3 text-[11px] text-stone-600">
           {type === 'deposit'
             ? 'Deposit addresses are automatically assigned to the account and kept on file for wallet funding.'
             : 'Withdrawals are processed after manual review (simulated).'}
         </p>
        </form>

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
                <div className={`font-mono ${t.type === 'deposit' ? 'text-emerald-400' : 'text-rose-300'}`}>
                  {t.type === 'deposit' ? '+' : '−'}{formatMoney(Number(t.amount))}
                </div>
              </div>
            ))}
            {!txns.some((t) => t.type === 'deposit' || t.type === 'withdrawal') && (
              <div className="px-5 py-8 text-sm text-stone-500">No cash activity.</div>
            )}
          </div>
        </div>
      </div>

      {depositAddresses.length > 0 && (
        <div className="mt-8 rounded-md border border-white/5 p-5">
          <div className="text-[10px] uppercase tracking-widest text-stone-500">Your Deposit Addresses</div>
          <div className="mt-2 space-y-2">
            {depositAddresses.map((item) => (
              <div key={item.id} className="flex items-center gap-3 text-sm">
                <span className="w-20 font-medium">{item.currency}</span>
                <span className="rounded border border-white/10 bg-white/5 px-2 py-1 text-[10px] uppercase tracking-[0.18em] text-stone-400">
                  {item.network || 'network'}
                </span>
                <code className="flex-1 truncate rounded bg-black/40 px-2 py-1 font-mono text-xs text-amber-200/80">
                  {item.address}
                </code>
                <button
                  type="button"
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

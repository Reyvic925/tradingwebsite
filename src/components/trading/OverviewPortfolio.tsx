import { Link } from 'react-router-dom';
import { formatMoney, formatPrice } from '../../lib/format';
import { getInstrument } from '../../../shared/trading-instruments.js';
import { marketSession } from '../../../shared/trading-sessions.js';
import type { Snapshot } from './types';

export default function OverviewPortfolio({snapshot}:{snapshot:Snapshot|null}) {
  if(!snapshot)return null;
  const {account,positions,orders,fills}=snapshot;
  const working=orders.filter(order=>['pending','triggered'].includes(order.status));
  const equity=Number(account.equity),reserved=Number(account.reserved_cash),utilization=equity>0?reserved/equity*100:null;
  const groups=new Map<string,{symbol:string;gross:number;net:number}>();
  let stopRisk=0,unprotected=0;
  for(const position of positions){
    const value=Number(position.current_price)*Number(position.quantity)*Number(position.contract_multiplier||1)*Number(position.quote_to_usd||1);
    const group=groups.get(position.symbol)||{symbol:position.symbol,gross:0,net:0};group.gross+=value;group.net+=value*(position.side==='long'?1:-1);groups.set(position.symbol,group);
    if(position.stop_loss==null)unprotected++;
    else stopRisk+=Math.max(0,(position.side==='long'?Number(position.current_price)-Number(position.stop_loss):Number(position.stop_loss)-Number(position.current_price))*Number(position.quantity)*Number(position.contract_multiplier||1)*Number(position.quote_to_usd||1));
  }
  const exposure=[...groups.values()].sort((a,b)=>b.gross-a.gross),gross=exposure.reduce((sum,row)=>sum+row.gross,0);
  const clocks=[['Crypto','BTCUSD'],['US equities','AAPL'],['FX','EURUSD']].map(([label,symbol])=>({label,session:marketSession(getInstrument(symbol))}));
  return <div className="mt-6 space-y-4">
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{[
      ['Reserved collateral',formatMoney(reserved),utilization===null?'Equity unavailable':`${utilization.toFixed(1)}% of equity`],
      ['Realized / unrealized',`${formatMoney(Number(account.realized_pnl))} / ${formatMoney(Number(account.unrealized_pnl))}`,'USD, recorded trading values'],
      ['Working orders',String(working.length),`${positions.length} positions / ${snapshot.alerts.filter(a=>a.status==='active').length} active alerts`],
      ['Risk to stops',formatMoney(stopRisk),`${unprotected} positions without a stop; gaps and fees excluded`],
    ].map(([label,value,detail])=><div key={label} className="rounded-md border border-white/5 bg-white/[0.02] p-4"><div className="text-[10px] uppercase tracking-wider text-stone-500">{label}</div><div className="mt-2 font-mono text-lg">{value}</div><p className="mt-2 text-[10px] text-stone-500">{detail}</p></div>)}</div>
    <div className="grid gap-4 lg:grid-cols-3">
      <section className="rounded-md border border-white/5 p-4"><h2 className="text-xs uppercase tracking-wider text-stone-400">Portfolio exposure</h2><p className="mt-2 text-[10px] text-stone-500">Gross marked notional in USD. Long and short values remain separate from collateral.</p><div className="mt-4 space-y-3">{exposure.slice(0,6).map(row=><Link key={row.symbol} to={`/app/trade/${encodeURIComponent(row.symbol)}`} className="block"><div className="flex justify-between text-xs"><span>{row.symbol}</span><span className="font-mono">{formatMoney(row.gross)}</span></div><div className="mt-2 h-1 rounded bg-white/5"><div className="h-1 rounded bg-amber-400" style={{width:`${gross>0?row.gross/gross*100:0}%`}}/></div><div className="mt-1 text-[10px] text-stone-500">{gross>0?(row.gross/gross*100).toFixed(1):0}% concentration / net {formatMoney(row.net)}</div></Link>)}{!exposure.length&&<p className="text-xs text-stone-500">No open exposure.</p>}</div></section>
      <section className="rounded-md border border-white/5 p-4"><h2 className="text-xs uppercase tracking-wider text-stone-400">Sessions now</h2>{clocks.map(({label,session})=><div key={label} className="mt-4 border-b border-white/5 pb-3 text-xs"><div className="flex justify-between gap-2"><span>{label}</span><span className={session.open?'text-emerald-300':'text-amber-300'}>{session.label}</span></div><div className="mt-1 text-[10px] text-stone-500">{session.timezone}{session.next_transition_at?` / next transition ${new Date(session.next_transition_at).toLocaleString()}`:' / continuous session'}</div></div>)}<p className="mt-3 text-[10px] text-stone-500">Transition times use your local timezone. Contract holidays can differ; execution checks each instrument.</p></section>
      <section className="rounded-md border border-white/5 p-4"><h2 className="text-xs uppercase tracking-wider text-stone-400">Recent fills</h2>{fills.slice(0,4).map(fill=><Link to={`/app/trade/${encodeURIComponent(fill.symbol)}`} key={fill.id} className="mt-3 block border-b border-white/5 pb-3 text-xs"><div className="flex justify-between gap-2"><span>{fill.symbol} / {fill.side}</span><span>{fill.quantity} @ {formatPrice(Number(fill.price))}</span></div><div className="mt-1 text-[10px] text-stone-500">{fill.fill_type} / {new Date(fill.filled_at).toLocaleString()}</div></Link>)}{!fills.length&&<p className="mt-4 text-xs text-stone-500">No fills yet.</p>}<Link to="/app/trade" className="mt-4 inline-block text-xs text-amber-300">Manage orders, alerts and journal</Link></section>
    </div>
  </div>;
}

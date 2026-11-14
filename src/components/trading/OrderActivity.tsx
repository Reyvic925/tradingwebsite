import { useEffect, useState } from 'react';
import { apiGet } from '../../lib/api';
import { formatPrice } from '../../lib/format';
import type { TerminalOrder } from './types';
export default function OrderActivity({orders,timezone}:{orders:TerminalOrder[];timezone:string}) {
  const [history,setHistory]=useState<TerminalOrder[]>([]),[cursor,setCursor]=useState(Number.MAX_SAFE_INTEGER),[error,setError]=useState(''),[loading,setLoading]=useState(false);
  useEffect(()=>{setHistory(old=>[...new Map([...old,...orders].map(order=>[order.id,order])).values()]);},[orders]);
  const load=async(before:number)=>{
    setLoading(true);try{const rows=await apiGet<TerminalOrder[]>(`/api/paper/orders?before=${before}`);setHistory(old=>[...new Map([...old,...rows].map(order=>[order.id,order])).values()]);setCursor(rows.at(-1)?Number(rows.at(-1)!.id):0);}catch(e){setError(e instanceof Error?e.message:'Order history unavailable');}finally{setLoading(false);}
  };
  useEffect(()=>{void load(Number.MAX_SAFE_INTEGER);},[]);
  const date=(value:string|null|undefined)=>value?new Intl.DateTimeFormat('en-GB',{timeZone:timezone,dateStyle:'short',timeStyle:'medium'}).format(Date.parse(value)):'—';
  return <div className="overflow-x-auto"><table className="terminal-table"><thead><tr><th>Order</th><th>Status</th><th>Received · {timezone}</th><th>Trigger / fill</th><th>Time to fill</th></tr></thead><tbody>{history.sort((a,b)=>Number(b.id)-Number(a.id)).map(order=>{
    const duration=order.filled_at&&order.received_at?Math.max(0,Date.parse(order.filled_at)-Date.parse(order.received_at)):null;
    return <tr key={order.id}><td className="font-mono">#{order.id} {order.symbol}<div className="text-[9px] text-stone-500">{order.side} {order.quantity} · {order.type} · {order.time_in_force}</div></td><td><span className={order.status==='filled'?'text-emerald-300':order.status==='rejected'?'text-rose-300':'text-stone-400'}>{order.status==='cancelled'&&order.reject_reason==='Order expired.'?'expired':order.status}</span><div className="mt-1 max-w-48 text-[9px] text-stone-500">{order.reject_reason}</div></td><td className="text-[10px]">{date(order.received_at||order.created_at)}</td><td className="text-[10px]">{order.filled_price!=null?formatPrice(order.filled_price):'—'}<div className="text-[9px] text-stone-500">{date(order.filled_at||order.triggered_at)}</div></td><td className="font-mono text-[10px]">{duration===null?'—':duration<1000?`${duration}ms`:`${(duration/1000).toFixed(1)}s`}<div className="text-[9px] text-stone-600">Includes queue time; separate from market-data delay.</div></td></tr>;
  })}</tbody></table>{error&&<p className="p-3 text-xs text-rose-300">{error}</p>}<button type="button" className="terminal-button m-3" disabled={loading||!cursor} onClick={()=>void load(cursor)}>{loading?'Loading…':cursor?'Load older orders':'All available orders loaded'}</button></div>;
}

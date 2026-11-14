import { useMemo } from 'react';
import { orderPreview } from '../../../shared/trading-instruments.js';
import { parseZonedExpiry } from '../../../shared/trading-sessions.js';
import { formatMoney, formatPrice } from '../../lib/format';
import type { Quote, Snapshot } from './types';

export type Ticket = {side:'buy'|'sell';type:'market'|'limit'|'stop'|'stop_limit';quantity:string;cash:string;risk:string;sizing:'quantity'|'cash'|'risk';limit:string;stop:string;sl:string;tp:string;trailing:string;tif:'DAY'|'GTC'|'GTD';expiry:string;reduceOnly:boolean;positionId:string};
export const freshTicket:Ticket={side:'buy',type:'market',quantity:'1',cash:'100',risk:'1',sizing:'quantity',limit:'',stop:'',sl:'',tp:'',trailing:'',tif:'DAY',expiry:'',reduceOnly:false,positionId:''};
export function ticketCalculation(ticket:Ticket,quote:Quote|null,snapshot:Snapshot|null) {
  if(!quote)return {quantity:0,entry:0,preview:null};
  const entry=['limit','stop_limit'].includes(ticket.type)?Number(ticket.limit):ticket.type==='stop'?Number(ticket.stop):quote.price;
  const spec=quote.instrument,unitValue=spec.multiplier*quote.quote_to_usd;
  let quantity=Number(ticket.quantity);
  if(!ticket.reduceOnly&&ticket.sizing==='cash')quantity=entry*unitValue>0?Number(ticket.cash)/(entry*unitValue):0;
  if(!ticket.reduceOnly&&ticket.sizing==='risk') {
    const distance=ticket.side==='buy'?entry-Number(ticket.sl):Number(ticket.sl)-entry;
    quantity=distance>0&&unitValue>0?Number(snapshot?.account.equity||0)*Number(ticket.risk)/100/(distance*unitValue):0;
  }
  quantity=Number((Math.floor((quantity+1e-12)/spec.quantity_step)*spec.quantity_step).toFixed(8));
  const preview=Number.isFinite(quantity)&&quantity>0&&entry>0&&unitValue>0?orderPreview({instrument:spec,price:entry,quantity,side:ticket.side,stopLoss:Number(ticket.sl),takeProfit:Number(ticket.tp),
    rate:quote.quote_to_usd,equity:Number(snapshot?.account.equity||0),commissionBps:Number(snapshot?.preferences.commission_bps||0)}):null;
  return {quantity,entry,preview};
}
type Props={ticket:Ticket;setTicket:(ticket:Ticket)=>void;quote:Quote|null;snapshot:Snapshot|null;timezone:string;busy:boolean;onReview:(body:Record<string,unknown>,description:string)=>void};
export default function OrderTicket({ticket,setTicket,quote,snapshot,timezone,busy,onReview}:Props) {
  const update=(patch:Partial<Ticket>)=>setTicket({...ticket,...patch});
  const {quantity,entry,preview}=useMemo(()=>ticketCalculation(ticket,quote,snapshot),[ticket,quote,snapshot]);
  const positions=snapshot?.positions.filter(p=>p.symbol===quote?.symbol)||[];
  const reason=!quote?'Waiting for a provider quote.':!quote.instrument.supported?quote.instrument.unavailable_reason
    :!quote.quote_to_usd?'USD conversion is unavailable.':ticket.type==='market'&&!quote.session.open?quote.session.label
      :ticket.type==='market'&&quote.quote_stale?'Quote is stale; market execution is paused.':null;
  const canSubmit=Boolean(quote&&preview&&quantity>0&&!reason&&(!ticket.reduceOnly||ticket.positionId));
  const submit=(event:React.FormEvent)=>{
    event.preventDefault();if(busy||!quote||!canSubmit)return;
    let expires:string|undefined;
    try{if(ticket.tif==='GTD')expires=parseZonedExpiry(ticket.expiry,timezone);}catch(error){onReview({invalid:error instanceof Error?error.message:'Invalid expiry'},'');return;}
    onReview({market_id:quoteId(quote,snapshot),symbol:quote.symbol,side:ticket.side,type:ticket.type,quantity,
      limit_price:['limit','stop_limit'].includes(ticket.type)?Number(ticket.limit):undefined,
      stop_price:['stop','stop_limit'].includes(ticket.type)?Number(ticket.stop):undefined,
      stop_loss:!ticket.reduceOnly&&ticket.sl?Number(ticket.sl):null,take_profit:!ticket.reduceOnly&&ticket.tp?Number(ticket.tp):null,
      trailing_percent:!ticket.reduceOnly&&ticket.trailing?Number(ticket.trailing):null,time_in_force:ticket.tif,expires_at:expires,
      reduce_only:ticket.reduceOnly,position_id:ticket.reduceOnly?Number(ticket.positionId):undefined},
      `${ticket.side.toUpperCase()} ${quantity} ${quote.symbol} · ${ticket.type.replace('_','-')} · ${ticket.tif}${expires?` · expires ${expires}`:''}`);
  };
  return <form onSubmit={submit} className="terminal-panel p-4">
    <div className="flex items-center justify-between text-[10px] uppercase tracking-widest"><span className="text-stone-400">Paper order ticket</span><span className="text-amber-200">{quote?.symbol||'Select market'}</span></div>
    <div className="mt-3 grid grid-cols-2 gap-1 rounded bg-black/40 p-1">{(['buy','sell']as const).map(side=><button key={side} type="button" disabled={ticket.reduceOnly} onClick={()=>update({side})} className={`rounded py-2 text-xs uppercase tracking-wider ${ticket.side===side?(side==='buy'?'bg-emerald-400 text-black':'bg-rose-400 text-black'):'text-stone-500'}`}>{side==='buy'?'Buy / Long':'Sell / Short'}</button>)}</div>
    <div className="mt-3 grid grid-cols-4 gap-1">{(['market','limit','stop','stop_limit']as const).map(type=><button key={type} type="button" onClick={()=>update({type})} className={`rounded border px-1 py-2 text-[9px] uppercase ${ticket.type===type?'border-amber-300/50 text-amber-200':'border-white/10 text-stone-500'}`}>{type==='stop_limit'?'Stop-limit':type}</button>)}</div>
    <label className="mt-4 flex items-center gap-2 text-xs text-stone-400"><input type="checkbox" checked={ticket.reduceOnly} onChange={e=>{const p=positions[0];update({reduceOnly:e.target.checked,positionId:p?String(p.id):'',side:p?(p.side==='long'?'sell':'buy'):ticket.side,quantity:p?String(p.quantity):ticket.quantity,sizing:'quantity',sl:'',tp:'',trailing:''});}}/> Reduce only</label>
    {ticket.reduceOnly&&<select aria-label="Position to reduce" className="terminal-input mt-2 w-full" value={ticket.positionId} onChange={e=>{const p=positions.find(p=>String(p.id)===e.target.value);update({positionId:e.target.value,side:p?.side==='long'?'sell':'buy',quantity:p?String(p.quantity):'0'});}}><option value="">Select an open position</option>{positions.map(p=><option key={p.id} value={p.id}>{p.side} · {p.quantity} remaining · #{p.id}</option>)}</select>}
    {!ticket.reduceOnly&&<div className="mt-4 flex gap-1">{(['quantity','cash','risk']as const).map(sizing=><button key={sizing} type="button" onClick={()=>update({sizing})} className={`flex-1 rounded py-1.5 text-[10px] ${ticket.sizing===sizing?'bg-white/10 text-white':'text-stone-500'}`}>{sizing==='risk'?'Risk %':sizing==='cash'?'USD amount':'Quantity'}</button>)}</div>}
    <label className="terminal-label">{ticket.sizing==='risk'&&!ticket.reduceOnly?'Account equity risk %':ticket.sizing==='cash'&&!ticket.reduceOnly?'USD notional amount':`Quantity · ${quote?.instrument.unit||'units'}`}</label>
    <input aria-label="Order size" className="terminal-input w-full" type="number" min="0" step="any" value={ticket.reduceOnly||ticket.sizing==='quantity'?ticket.quantity:ticket.sizing==='cash'?ticket.cash:ticket.risk}
      onChange={e=>update(ticket.reduceOnly||ticket.sizing==='quantity'?{quantity:e.target.value}:ticket.sizing==='cash'?{cash:e.target.value}:{risk:e.target.value})}/>
    <div className="mt-1 flex justify-between text-[10px] text-stone-500"><span>{quantity>0?`${quantity} ${quote?.instrument.unit||''}`:'Enter a valid size'}</span><button type="button" onClick={()=>{if(quote){const cost=entry*quote.instrument.multiplier*quote.quote_to_usd*(1+Number(snapshot?.preferences.commission_bps||0)/10000);const max=cost>0?Math.floor(Number(snapshot?.account.available_cash||0)/cost/quote.instrument.quantity_step)*quote.instrument.quantity_step:0;update({sizing:'quantity',quantity:String(Number(max.toFixed(8)))});}}}>Max available</button></div>
    {['limit','stop_limit'].includes(ticket.type)&&<><label className="terminal-label">Limit price · {quote?.quote_currency}</label><input aria-label="Limit price" className="terminal-input w-full" type="number" step={quote?.instrument.tick||'any'} min="0" value={ticket.limit} onChange={e=>update({limit:e.target.value})}/></>}
    {['stop','stop_limit'].includes(ticket.type)&&<><label className="terminal-label">Stop trigger</label><input aria-label="Stop trigger" className="terminal-input w-full" type="number" step={quote?.instrument.tick||'any'} value={ticket.stop} onChange={e=>update({stop:e.target.value})}/></>}
    {!ticket.reduceOnly&&<><div className="mt-3 grid grid-cols-2 gap-2"><label><span className="terminal-label">Stop loss</span><input aria-label="Stop loss" type="number" step={quote?.instrument.tick||'any'} className="terminal-input w-full" value={ticket.sl} onChange={e=>update({sl:e.target.value})}/></label><label><span className="terminal-label">Take profit</span><input aria-label="Take profit" type="number" step={quote?.instrument.tick||'any'} className="terminal-input w-full" value={ticket.tp} onChange={e=>update({tp:e.target.value})}/></label></div>
      <label className="terminal-label">Trailing stop distance % · optional</label><input aria-label="Trailing stop percent" type="number" min="0" max="50" step=".1" className="terminal-input w-full" value={ticket.trailing} onChange={e=>update({trailing:e.target.value})}/><p className="mt-1 text-[9px] text-stone-500">Linked exits: closing the position removes the other exit. A trailing stop only tightens.</p></>}
    <div className="mt-3 grid grid-cols-2 gap-2"><label><span className="terminal-label">Time in force</span><select className="terminal-input w-full" aria-label="Time in force" value={ticket.tif} onChange={e=>update({tif:e.target.value as Ticket['tif']})}><option value="DAY">Day</option><option value="GTC">Good till cancelled</option><option value="GTD">Good till date</option></select></label><div className="self-end text-[9px] leading-relaxed text-stone-500">DAY follows the next eligible session close. GTC remains until cancelled.</div></div>
    {ticket.tif==='GTD'&&<><label className="terminal-label">Expiry · {timezone}</label><input aria-label="Order expiry" type="datetime-local" className="terminal-input w-full" value={ticket.expiry} onChange={e=>update({expiry:e.target.value})}/></>}
    <div className="mt-4 space-y-2 rounded border border-white/5 bg-black/30 p-3 text-[11px]">
      <div className="flex justify-between"><span className="text-stone-500">Estimated entry</span><span>{entry>0?formatPrice(entry):'—'} {quote?.quote_currency}</span></div>
      <div className="flex justify-between"><span className="text-stone-500">Notional / collateral</span><span>{preview?formatMoney(preview.collateral):'—'}</span></div>
      <div className="flex justify-between"><span className="text-stone-500">Simulated entry fee</span><span>{preview?formatMoney(preview.entry_fee):'—'}</span></div>
      <div className="flex justify-between"><span className="text-stone-500">Loss at stop*</span><span className="text-rose-300">{preview?.risk_at_stop!=null?formatMoney(preview.risk_at_stop):'Set a valid stop'}</span></div>
      <div className="flex justify-between"><span className="text-stone-500">Potential profit*</span><span className="text-emerald-300">{preview?.potential_profit!=null?formatMoney(preview.potential_profit):'Set a valid target'}</span></div>
      <div className="flex justify-between"><span className="text-stone-500">Reward / risk</span><span>{preview?.reward_to_risk!=null?`${preview.reward_to_risk.toFixed(2)} : 1`:'—'}</span></div>
      <div className="border-t border-white/5 pt-2 text-[9px] leading-relaxed text-stone-500">Full notional collateral · {quote?.instrument.multiplier||1}× point value · available {formatMoney(Number(snapshot?.account.available_cash||0))}. *Stops are not guaranteed prices; financing and taxes excluded.</div>
    </div>
    {reason&&<p className="mt-3 text-[10px] text-amber-200">{reason}</p>}
    <button type="submit" disabled={!canSubmit||busy} className={`mt-4 w-full rounded py-3 text-xs font-semibold uppercase tracking-[.16em] disabled:cursor-not-allowed disabled:opacity-35 ${ticket.side==='buy'?'bg-emerald-400 text-black':'bg-rose-400 text-black'}`}>{busy?'Submitting…':`Review ${ticket.side} order`}</button>
    <p className="mt-2 text-[9px] leading-relaxed text-stone-500">Execution uses a server-validated quote. Pending orders do not reserve cash; buying power is checked at fill. Delayed feeds remain delayed.</p>
  </form>;
}
// The terminal supplies the actual catalog ID before sending a reviewed ticket.
function quoteId(quote:Quote,snapshot:Snapshot|null) {return snapshot?.positions.find(p=>p.symbol===quote.symbol)?.market_id||0;}

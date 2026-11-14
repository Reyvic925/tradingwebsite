import { useEffect, useRef, useState } from 'react';
import { apiSend } from '../../lib/api';
import { formatMoney, formatPrice } from '../../lib/format';
import { getInstrument, validQuantity } from '../../../shared/trading-instruments.js';
import type { TerminalPosition } from './types';

export default function OverviewCloseDialog({position,commissionBps,onDone,onDismiss}:{position:TerminalPosition;commissionBps:number;onDone:()=>Promise<void>;onDismiss:()=>void}) {
  const [quantity,setQuantity]=useState(String(position.quantity));
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),[uncertain,setUncertain]=useState(false);
  const inFlight=useRef(false),request=useRef<{id:number|string;quantity:number;client_request_id:string}|null>(null);
  const dialog=useRef<HTMLDialogElement>(null);
  useEffect(()=>{const element=dialog.current;element?.showModal();return()=>element?.close();},[]);
  const instrument=getInstrument(position.symbol),size=Number(quantity),step=instrument?.quantity_step||1;
  const valid=!!instrument&&validQuantity(size,instrument)&&size<=Number(position.quantity);
  const fraction=valid?size/Number(position.quantity):0;
  const estimate=Number(position.unrealized_pnl)*fraction;
  const notional=Number(position.current_price)*size*Number(position.contract_multiplier||1)*Number(position.quote_to_usd||1);
  const fee=notional*commissionBps/10000;
  const submit=async()=>{
    if(inFlight.current||!valid)return;
    inFlight.current=true;setBusy(true);setError('');
    request.current??={id:position.id,quantity:size,client_request_id:crypto.randomUUID()};
    try {
      await apiSend('/api/paper/positions','DELETE',request.current);
      // A confirmed settlement must never be re-submitted because a refresh failed.
      try{await onDone();}catch{/* confirmed settlement; refresh errors must not permit another close */}finally{onDismiss();}
    }catch(e){const status=(e as {status?:number}).status;const unknown=!status||status>=500;setUncertain(unknown);if(!unknown)request.current=null;setError((e instanceof Error?e.message:'Close failed.')+(unknown?' Outcome unknown. Retry this same request to reconcile safely.':''));}
    finally{inFlight.current=false;setBusy(false);}
  };
  return <dialog ref={dialog} aria-modal="true" aria-labelledby="overview-close-title" className="fixed inset-0 z-[100] m-auto w-[min(94vw,460px)] rounded-lg border border-white/15 bg-[#101217] p-6 text-stone-100 shadow-2xl backdrop:bg-black/70" onCancel={event=>{event.preventDefault();if(!busy&&!uncertain)onDismiss();}}>
    <h2 id="overview-close-title" className="text-xl">Close position</h2>
    <p className="mt-2 text-sm text-stone-400">{position.symbol} / {position.side} / {position.quantity} remaining</p>
    <label className="mt-5 block text-xs text-stone-400">Quantity to close<input autoFocus aria-label="Quantity to close" type="number" step={step} min={step} max={position.quantity} value={quantity} disabled={busy||uncertain} onChange={e=>setQuantity(e.target.value)} className="terminal-input mt-2 w-full"/></label>
    <div className="mt-2 flex gap-2">{[25,50,100].map(percent=><button key={percent} type="button" className="terminal-button" disabled={busy||uncertain} onClick={()=>setQuantity(String(percent===100?position.quantity:Number((Math.floor(Number(position.quantity)*percent/100/step+1e-8)*step).toPrecision(12))))}>{percent}%</button>)}</div>
    <dl className="mt-5 grid grid-cols-2 gap-3 text-xs"><dt>Last mark</dt><dd className="text-right">{formatPrice(Number(position.current_price))} {position.quote_currency}</dd><dt>Estimated realized P&amp;L</dt><dd className="text-right">{valid?formatMoney(estimate-fee):'Unavailable'}</dd><dt>Estimated exit fee</dt><dd className="text-right">{valid?formatMoney(fee):'Unavailable'}</dd></dl>
    <p className="mt-4 text-xs text-stone-500">Estimate uses the last account mark and excludes previously paid entry fees. The server checks the current session, price freshness and remaining quantity before filling. Final price may differ. A full close removes linked exits and pending reduce orders.</p>
    {position.quote_stale&&<p className="mt-3 text-xs text-amber-300">This mark is stale. A fresh execution quote is required.</p>}
    {!valid&&<p className="mt-3 text-xs text-amber-300">Enter a positive quantity up to {position.quantity} in increments of {step}.</p>}
    {error&&<p role="alert" className="mt-3 text-xs text-rose-300">{error}</p>}
    <div className="mt-5 flex justify-end gap-3"><button type="button" className="terminal-button" disabled={busy||uncertain} onClick={onDismiss}>Cancel</button><button type="button" className="rounded bg-rose-500 px-4 py-2 text-xs font-semibold text-white disabled:opacity-40" disabled={busy||!valid} onClick={()=>void submit()}>{busy?'Closing...':uncertain?'Reconcile close':size===Number(position.quantity)?'Confirm full close':'Confirm partial close'}</button></div>
  </dialog>;
}

import { useEffect, useRef, useState } from 'react';
import { Download, FileCheck2, X } from 'lucide-react';
import { apiGet } from '../lib/api';
import { certificateDate, certificateStatus, withdrawalCertificateSvg } from '../../shared/withdrawal-certificate.js';

type Record = { id:string;certificate_number:string;amount:number;amount_currency:string;requested_currency:string;status:string;reference:string;created_at:string;reviewed_at:string|null;kind:string;account_name:string|null };
type Page = {items:Record[];has_more:boolean;next_offset:number};

export default function WithdrawalCertificates({refreshKey=''}:{refreshKey?:string}) {
  const [items,setItems] = useState<Record[]>([]);
  const [next,setNext] = useState(0);
  const [more,setMore] = useState(false);
  const [loading,setLoading] = useState(true);
  const [error,setError] = useState('');
  const [selected,setSelected] = useState<Record|null>(null);
  const [includeName,setIncludeName] = useState(false);
  const [busy,setBusy] = useState(false);
  const closeButton = useRef<HTMLButtonElement>(null);
  const opener = useRef<HTMLElement|null>(null);
  async function load(offset=0) {
    setLoading(true);setError('');
    try { const data=await apiGet<Page>(`/api/withdrawal-certificates?offset=${offset}`);setItems(old=>offset?[...old,...data.items]:data.items);setNext(data.next_offset);setMore(data.has_more); }
    catch(e){setError(e instanceof Error?e.message:'Unable to load withdrawal records.');}
    finally{setLoading(false);}
  }
  useEffect(()=>{void load();},[refreshKey]);
  useEffect(()=>{
    if(!selected)return;
    const previousOverflow=document.body.style.overflow;document.body.style.overflow='hidden';closeButton.current?.focus();
    const onKey=(event:KeyboardEvent)=>{
      if(event.key==='Escape')setSelected(null);
      if(event.key==='Tab') {
        const controls=Array.from(document.querySelectorAll<HTMLElement>('[data-certificate-dialog] button:not(:disabled),[data-certificate-dialog] input:not(:disabled)'));
        const first=controls[0],last=controls.at(-1);
        if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}
        else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}
      }
    };
    window.addEventListener('keydown',onKey);
    return()=>{window.removeEventListener('keydown',onKey);document.body.style.overflow=previousOverflow;opener.current?.focus();};
  },[selected?.id]);
  async function open(record:Record,button:HTMLElement) {
    opener.current=button;setBusy(true);setError('');
    try { const current=await apiGet<Record>(`/api/withdrawal-certificates?id=${encodeURIComponent(record.id)}`);if(!Number.isFinite(current.amount)||current.amount<=0)throw new Error('This record has no valid withdrawal amount.');setIncludeName(false);setSelected(current); }
    catch(e){setError(e instanceof Error?e.message:'Unable to refresh this withdrawal.');}
    finally{setBusy(false);}
  }
  async function download() {
    if(!selected)return;
    setBusy(true);setError('');
    let source='';
    try {
      // Refresh the authoritative status before every export.
      const current=await apiGet<Record>(`/api/withdrawal-certificates?id=${encodeURIComponent(selected.id)}`);if(!Number.isFinite(current.amount)||current.amount<=0)throw new Error('This record has no valid withdrawal amount.');setSelected(current);
      source=URL.createObjectURL(new Blob([withdrawalCertificateSvg(current,includeName)],{type:'image/svg+xml;charset=utf-8'}));
      const img=new Image();await new Promise<void>((resolve,reject)=>{img.onload=()=>resolve();img.onerror=()=>reject(new Error('Unable to render the certificate.'));img.src=source;});
      const canvas=document.createElement('canvas');canvas.width=1800;canvas.height=1240;
      const context=canvas.getContext('2d');if(!context)throw new Error('Image export is unavailable in this browser.');context.drawImage(img,0,0);
      const blob=await new Promise<Blob>((resolve,reject)=>canvas.toBlob(value=>value?resolve(value):reject(new Error('Unable to export the certificate.')),'image/png'));
      const url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=`${current.certificate_number}-${current.status}.png`;document.body.appendChild(link);link.click();link.remove();window.setTimeout(()=>URL.revokeObjectURL(url),10000);
    }catch(e){setError(e instanceof Error?e.message:'Unable to download the certificate.');}
    finally{if(source)URL.revokeObjectURL(source);setBusy(false);}
  }
  const preview=selected?'data:image/svg+xml;charset=utf-8,'+encodeURIComponent(withdrawalCertificateSvg(selected,includeName)):'';
  return <section className="mt-6 overflow-hidden rounded-xl border border-amber-200/15 bg-gradient-to-br from-[#182028] to-[#0a1017]">
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/5 p-5"><div><div className="mb-2 text-[10px] uppercase tracking-[.24em] text-amber-200/70">Private client records</div><h2 className="font-display text-xl text-stone-100">Withdrawal certificates</h2><p className="mt-2 text-xs text-stone-400">Download a personal image of each withdrawal record, with its current status.</p></div><button onClick={()=>void load()} disabled={loading||busy} className="text-xs text-amber-200 disabled:opacity-40">Refresh records</button></div>
    {error&&<p role="alert" className="p-5 text-sm text-rose-200">{error}</p>}
    <div className="divide-y divide-white/5">{items.map(record=><div key={record.id} className="flex flex-wrap items-center justify-between gap-4 px-5 py-4"><div><div className="font-mono text-stone-100">{new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(record.amount)} <span className="ml-2 text-[10px] text-amber-200/80">{certificateStatus(record).label}</span></div><p className="mt-1 text-[11px] text-stone-400">{record.certificate_number} / {certificateDate(record.created_at)}</p></div><button disabled={busy} onClick={event=>void open(record,event.currentTarget)} className="inline-flex items-center gap-2 rounded border border-amber-200/20 px-3 py-2 text-xs text-amber-100 hover:bg-amber-200/10 disabled:opacity-40"><FileCheck2 size={15}/>View certificate</button></div>)}</div>
    {!loading&&!items.length&&!error&&<p className="p-5 text-sm text-stone-400">Your certificates will appear here after a withdrawal is requested.</p>}
    {loading&&<p role="status" className="p-5 text-xs text-stone-400">Loading withdrawal records...</p>}
    {more&&<button onClick={()=>void load(next)} disabled={loading} className="m-5 text-xs text-amber-200">Load older withdrawals</button>}
    {selected&&<div className="fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto bg-black/85 p-3 backdrop-blur-sm sm:p-6" onClick={event=>{if(event.target===event.currentTarget&&!busy)setSelected(null);}}><div role="dialog" aria-modal="true" aria-labelledby="withdrawal-certificate-title" data-certificate-dialog className="my-auto w-full max-w-5xl overflow-hidden rounded-xl border border-amber-200/20 bg-[#101820] shadow-2xl"><div className="flex items-center justify-between gap-3 px-5 py-4"><h3 id="withdrawal-certificate-title" className="font-display text-lg text-amber-50">Your withdrawal certificate</h3><button ref={closeButton} aria-label="Close certificate" onClick={()=>setSelected(null)} disabled={busy} className="p-2 text-stone-300"><X size={19}/></button></div><div className="max-h-[60vh] overflow-auto bg-[#f0ebdf]"><img src={preview} alt={`Withdrawal certificate for ${selected.amount} USD. Status: ${certificateStatus(selected).label}.`} className="block h-auto w-full" width={1800} height={1240}/></div><div className="space-y-3 p-5"><p className="text-xs leading-relaxed text-stone-400">{certificateStatus(selected).description}</p>{selected.account_name&&<label className="flex items-center gap-2 text-xs text-stone-300"><input type="checkbox" checked={includeName} onChange={event=>setIncludeName(event.target.checked)} disabled={busy}/>Include my name in the downloaded image</label>}<p className="text-[11px] text-stone-500">Your name is hidden by default. Wallet addresses, account IDs and contact details are excluded. Nothing is shared automatically.</p>{error&&<p role="alert" className="text-xs text-rose-200">{error}</p>}<button onClick={()=>void download()} disabled={busy} className="inline-flex items-center gap-2 rounded bg-gradient-to-r from-[#c8ab6f] to-[#ead8aa] px-5 py-3 text-xs font-semibold text-[#17232c] disabled:opacity-50"><Download size={16}/>{busy?'Preparing image...':'Download PNG / 1800 × 1240'}</button></div></div></div>}
  </section>;
}

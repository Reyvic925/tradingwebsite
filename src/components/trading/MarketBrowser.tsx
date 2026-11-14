import { useEffect, useMemo, useRef, useState } from 'react';
import { Star } from 'lucide-react';
import { apiGet } from '../../lib/api';
import { formatPrice } from '../../lib/format';
import { startVisibleInterval } from '../../lib/visible-interval';
import type { CatalogMarket } from './types';

type Props={catalog:CatalogMarket[];selected?:string;watch:number[];onWatch:(market:CatalogMarket)=>void;onSelect:(symbol:string)=>void;active?:boolean};
export default function MarketBrowser({catalog,selected,watch,onWatch,onSelect,active=true}:Props) {
  const [search,setSearch]=useState(''),[debounced,setDebounced]=useState(''),[filter,setFilter]=useState('all'),[scroll,setScroll]=useState(0);
  const [prices,setPrices]=useState<Record<string,{price:number|null;price_source:string;quote_currency:string;quote_updated_at:string}>>({});
  const [viewportHeight,setViewportHeight]=useState(600);
  const root=useRef<HTMLDivElement>(null),request=useRef(0);
  useEffect(()=>{const timer=setTimeout(()=>setDebounced(search),250);return()=>clearTimeout(timer);},[search]);
  useEffect(()=>{if(!root.current)return;const observer=new ResizeObserver(entries=>setViewportHeight(entries[0].contentRect.height));observer.observe(root.current);return()=>observer.disconnect();},[]);
  const rows=useMemo(()=>catalog.filter(m=>{
    const q=debounced.toLowerCase();if(q&&!`${m.symbol} ${m.name}`.toLowerCase().includes(q))return false;
    if(filter==='watch')return watch.includes(m.id);
    if(filter==='all')return true;
    if(filter==='stock')return !['crypto','forex','futures'].includes(m.asset_class)&&!m.asset_class.includes('etf');
    if(filter==='etf')return m.asset_class.includes('etf');return m.asset_class===filter;
  }),[catalog,debounced,filter,watch]);
  useEffect(()=>{setScroll(0);if(root.current)root.current.scrollTop=0;},[debounced,filter]);
  const start=Math.max(0,Math.floor(scroll/66)-1),visible=rows.slice(start,start+Math.ceil(viewportHeight/66)+3),symbols=visible.map(m=>m.symbol).join(',');
  useEffect(()=>{
    if(!active)return;
    const id=++request.current;
    const stop=startVisibleInterval(async()=>{
      if(!symbols)return;
      try{
        const list=symbols.split(','),chunks=Array.from({length:Math.ceil(list.length/12)},(_,index)=>list.slice(index*12,index*12+12).join(','));
        const results=await Promise.allSettled(chunks.map(chunk=>apiGet<{items:{symbol:string;price:number|null;price_source:string;quote_currency:string;quote_updated_at:string}[]}>(`/api/paper/quotes?symbols=${encodeURIComponent(chunk)}`)));
        const items=results.flatMap(result=>result.status==='fulfilled'?result.value.items:[]);
        if(id===request.current)setPrices(previous=>({...previous,...Object.fromEntries(items.map(row=>[row.symbol,row]))}));}catch{/* retain labeled last quote */}
    },15000);
    return()=>{stop();request.current++;};
  },[symbols,active]);
  return <div className="flex h-full min-h-[560px] flex-col">
    <div className="border-b border-white/5 p-3"><div className="text-xs uppercase tracking-[.18em] text-stone-400">Markets <span className="text-amber-200">{catalog.length.toLocaleString()}</span></div>
      <input aria-label="Search all verified markets" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Symbol or company…" className="terminal-input mt-3 w-full"/>
      <div className="mt-2 flex flex-wrap gap-1">{[['all','All'],['watch','★ Watch'],['stock','Stocks'],['etf','ETFs'],['crypto','Crypto'],['forex','FX'],['futures','Futures']].map(([id,label])=><button type="button" key={id} onClick={()=>setFilter(id)} className={`rounded px-2 py-1 text-[10px] ${filter===id?'bg-amber-400/15 text-amber-200':'text-stone-500 hover:text-white'}`}>{label}</button>)}</div>
    </div>
    <div className="px-3 py-2 text-[10px] text-stone-500">{rows.length.toLocaleString()} matches · quotes load for visible rows</div>
    <div ref={root} onScroll={e=>setScroll(e.currentTarget.scrollTop)} className="h-[66vh] min-h-[400px] overflow-y-auto" aria-label="Verified market list">
      {!rows.length&&<div className="p-4 text-xs text-stone-500">{filter==='watch'?'Star a symbol to add it to your watchlist.':'No matching markets.'}</div>}
      <div style={{height:rows.length*66,position:'relative'}}>
        {visible.map((market,index)=>{const quote=prices[market.symbol];return <div key={market.id} style={{position:'absolute',top:(start+index)*66,height:66,width:'100%'}} className={`flex items-center border-b border-white/5 ${selected===market.symbol?'bg-amber-400/10':''}`}>
          <button type="button" aria-label={`${watch.includes(market.id)?'Remove':'Add'} ${market.symbol} ${watch.includes(market.id)?'from':'to'} watchlist`} onClick={()=>onWatch(market)} className={`px-2 ${watch.includes(market.id)?'text-amber-300':'text-stone-600'}`}><Star size={13} fill={watch.includes(market.id)?'currentColor':'none'}/></button>
          <button type="button" onClick={()=>onSelect(market.symbol)} className="flex min-w-0 flex-1 items-center justify-between gap-2 py-2 pr-3 text-left">
            <div className="min-w-0"><div className="font-mono text-xs text-stone-100">{market.symbol}</div><div className="mt-1 max-w-[125px] truncate text-[10px] text-stone-500" title={market.name}>{market.name}</div></div>
            <div className="shrink-0 text-right"><div className="font-mono text-[11px]">{quote?.price!=null?formatPrice(quote.price):'—'}</div><div className="mt-1 text-[9px] text-stone-500" title={quote?.price_source}>{quote?.quote_currency||market.currency}{quote?.quote_updated_at?` · ${new Date(quote.quote_updated_at).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}`:''}</div></div>
          </button>
        </div>;})}
      </div>
    </div>
  </div>;
}

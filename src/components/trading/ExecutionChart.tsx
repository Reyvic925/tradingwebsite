import { useEffect, useRef, useState } from 'react';
import { apiGet } from '../../lib/api';
import { formatPrice } from '../../lib/format';
import type { Bar, Quote } from './types';

type Props={quote:Quote;interval:string;entry:number;stop:number;take:number;onEntry:(price:number)=>void;onStop:(price:number)=>void;onTake:(price:number)=>void};
export default function ExecutionChart({quote,interval,entry,stop,take,onEntry,onStop,onTake}:Props) {
  const [bars,setBars]=useState<Bar[]>([]),[observed,setObserved]=useState<{time:number;price:number}[]>([]),[source,setSource]=useState('Loading historical candles');
  const svg=useRef<SVGSVGElement>(null),drag=useRef<'entry'|'stop'|'take'|null>(null);
  useEffect(()=>{
    let active=true;setBars([]);setObserved([]);
    apiGet<{bars:Bar[];source:string;available:boolean}>(`/api/paper/bars?symbol=${encodeURIComponent(quote.symbol)}&interval=${interval}`)
      .then(data=>{if(active){setBars(data.bars);setSource(data.available?`${data.source} historical candles`:'Observed provider quotes · history unavailable');}})
      .catch(()=>{if(active)setSource('Observed provider quotes · history unavailable');});
    return()=>{active=false;};
  },[quote.symbol,interval]);
  useEffect(()=>{const time=Date.parse(quote.quote_updated_at)/1000;setObserved(points=>{const next=points.filter(p=>p.time!==time);return [...next,{time,price:quote.price}].sort((a,b)=>a.time-b.time).slice(-120);});},[quote.price,quote.quote_updated_at]);
  const width=920,height=400,left=20,right=105,top=22,bottom=34,plotW=width-left-right,plotH=height-top-bottom;
  const shown=bars.slice(-90);
  const values=[...shown.flatMap(b=>[b.low,b.high]),...observed.map(p=>p.price),quote.price,entry,stop,take].filter(v=>Number.isFinite(v)&&v>0);
  const low=Math.min(...values),high=Math.max(...values),padding=Math.max((high-low)*.12,quote.price*.002);
  const min=low-padding,max=high+padding;
  const y=(price:number)=>top+(max-price)/(max-min)*plotH;
  const priceAt=(clientY:number)=>{
    const rect=svg.current!.getBoundingClientRect();const yy=(clientY-rect.top)/rect.height*height;
    const raw=max-(Math.max(top,Math.min(top+plotH,yy))-top)/plotH*(max-min),tick=quote.instrument.tick;
    return Number((Math.round(raw/tick)*tick).toFixed(10));
  };
  const move=(event:React.PointerEvent<SVGSVGElement>)=>{if(!drag.current)return;const value=priceAt(event.clientY);if(drag.current==='entry')onEntry(value);else if(drag.current==='stop')onStop(value);else onTake(value);};
  const level=(name:'entry'|'stop'|'take',value:number,color:string)=>value>0&&<g key={name} role="slider" tabIndex={0} aria-label={`${name} price`} aria-valuenow={value}
    onKeyDown={event=>{if(['ArrowUp','ArrowDown'].includes(event.key)){event.preventDefault();const next=value+(event.key==='ArrowUp'?1:-1)*quote.instrument.tick;if(name==='entry')onEntry(next);else if(name==='stop')onStop(next);else onTake(next);}}}
    onPointerDown={event=>{event.preventDefault();drag.current=name;svg.current?.setPointerCapture(event.pointerId);}} style={{cursor:'ns-resize'}}>
    <line x1={left} x2={width-right} y1={y(value)} y2={y(value)} stroke={color} strokeDasharray="6 4" strokeWidth="1.5" />
    <rect x={width-right+2} y={y(value)-12} width={100} height={24} rx={4} fill={color}/><text x={width-right+8} y={y(value)+4} fill="#050a11" fontSize={10}>{name.toUpperCase()} {formatPrice(value)}</text>
  </g>;
  return <div className="flex h-full flex-col">
    <div className="flex justify-between gap-3 px-2 text-[10px] text-stone-400"><span>{source}</span><span>Drag Entry / SL / TP to prepare a ticket</span></div>
    <svg ref={svg} viewBox={`0 0 ${width} ${height}`} className="min-h-0 w-full flex-1 touch-none" role="img" aria-label={`${quote.symbol} execution chart`}
      onPointerMove={move} onPointerUp={()=>{drag.current=null;}} onPointerCancel={()=>{drag.current=null;}}
      onDoubleClick={event=>onEntry(priceAt(event.clientY))}>
      {Array.from({length:6},(_,i)=>{const value=min+(max-min)*i/5;return <g key={i}><line x1={left} x2={width-right} y1={y(value)} y2={y(value)} stroke="#ffffff0d"/><text x={width-right+8} y={y(value)+4} fill="#78716c" fontSize={10}>{formatPrice(value)}</text></g>;})}
      {shown.map((bar,i)=>{const x=left+(i+.5)/Math.max(1,shown.length)*plotW,w=Math.max(2,plotW/Math.max(shown.length,1)*.6),color=bar.close>=bar.open?'#34d399':'#fb7185';return <g key={bar.time}><line x1={x} x2={x} y1={y(bar.high)} y2={y(bar.low)} stroke={color}/><rect x={x-w/2} y={Math.min(y(bar.open),y(bar.close))} width={w} height={Math.max(1,Math.abs(y(bar.close)-y(bar.open)))} fill={color}/></g>;})}
      {!shown.length&&observed.length>1&&<polyline points={observed.map((p,i)=>`${left+i/(observed.length-1)*plotW},${y(p.price)}`).join(' ')} fill="none" stroke="#fbbf24" strokeWidth="2"/>}
      {!shown.length&&observed.length<2&&<text x={left+20} y={height-50} fill="#a8a29e" fontSize={12}>Waiting for additional observed prices. No synthetic history.</text>}
      <line x1={left} x2={width-right} y1={y(quote.price)} y2={y(quote.price)} stroke="#fbbf24" strokeWidth="1"/>
      {level('entry',entry,'#60a5fa')}{level('stop',stop,'#fb7185')}{level('take',take,'#34d399')}
      <text x={left} y={height-10} fill="#78716c" fontSize={10}>{quote.symbol} · {quote.quote_currency} · {quote.price_source}</text>
    </svg>
  </div>;
}

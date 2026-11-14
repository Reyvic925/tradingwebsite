import { useCallback, useEffect, useRef, useState } from 'react';
import { apiGet, apiSend } from '../../lib/api';
import { startVisibleInterval } from '../../lib/visible-interval';
import type { CatalogMarket, Quote, Snapshot } from './types';

export function useTerminal(symbol?:string) {
  const [catalog,setCatalog]=useState<CatalogMarket[]>([]);
  const [snapshot,setSnapshot]=useState<Snapshot|null>(null);
  const [quote,setQuote]=useState<Quote|null>(null);
  const [error,setError]=useState('');
  const [quoteError,setQuoteError]=useState('');
  const [connection,setConnection]=useState('Connecting');
  const [latency,setLatency]=useState<number|null>(null);
  const [serverOffset,setServerOffset]=useState(0);
  const [message,setMessage]=useState('');
  const quoteRequest=useRef(0),lastFills=useRef<Set<number>|null>(null),lastAlerts=useRef<Set<string>|null>(null);
  const lastOrders=useRef<Map<string,string>|null>(null);
  const notifications=useRef(false);
  const live=useRef(false),lastSync=useRef(0);
  const receive=useCallback((data:Snapshot)=>{
    setSnapshot(data);
    if(Number.isFinite(Date.parse(data.server_time)))setServerOffset(Date.parse(data.server_time)-Date.now());
    const fresh=data.fills.filter(fill=>lastFills.current&&!lastFills.current.has(fill.id));
    const alerts=data.alerts.filter(alert=>alert.status==='triggered'&&lastAlerts.current&&!lastAlerts.current.has(alert.id));
    const changed=data.orders.find(order=>lastOrders.current&&lastOrders.current.get(String(order.id))!==order.status&&['rejected','cancelled'].includes(order.status)&&order.reject_reason);
    const text=fresh[0]?`${fresh[0].side.toUpperCase()} ${fresh[0].quantity} ${fresh[0].symbol} filled at ${fresh[0].price}`
      :alerts[0]?`${alerts[0].symbol} price alert triggered at ${alerts[0].triggered_price}`:changed?`${changed.symbol} order ${changed.status}: ${changed.reject_reason}`:'';
    if(text){setMessage(text);if(notifications.current&&'Notification'in window&&Notification.permission==='granted')new Notification('Prime Markets trading',{body:text});}
    lastFills.current=new Set(data.fills.map(fill=>fill.id));lastAlerts.current=new Set(data.alerts.filter(a=>a.status==='triggered').map(a=>a.id));
    lastOrders.current=new Map(data.orders.map(order=>[String(order.id),order.status]));
  },[]);
  const refresh=useCallback(async()=>{lastSync.current=Date.now();const data=await apiSend<Snapshot>('/api/paper/sync','POST',{});receive(data);setError('');},[receive]);
  const refreshQuote=useCallback(async()=>{
    const id=++quoteRequest.current;if(!symbol){setQuote(null);return;}
    try{const data=await apiGet<Quote>(`/api/paper/quote?symbol=${encodeURIComponent(symbol)}`);if(id===quoteRequest.current){setQuote(data);setQuoteError('');}}
    catch(e){if(id===quoteRequest.current){setQuote(null);setQuoteError(e instanceof Error?e.message:'Quote unavailable');}}
  },[symbol]);
  useEffect(()=>{
    let active=true;
    try{const cached=JSON.parse(sessionStorage.getItem('prime-trading-catalog-v2')||'null');if(cached&&Date.now()-cached.at<300000)setCatalog(cached.items);}catch{/* storage is optional */}
    apiGet<{items:CatalogMarket[]}>('/api/paper/catalog').then(data=>{if(active){setCatalog(data.items);try{sessionStorage.setItem('prime-trading-catalog-v2',JSON.stringify({at:Date.now(),items:data.items}));}catch{/* quota */}}}).catch(e=>setError(e.message));
    return()=>{active=false;};
  },[]);
  useEffect(()=>{
    setQuote(null);const stop=startVisibleInterval(refreshQuote,15000);return()=>{stop();quoteRequest.current++;};
  },[refreshQuote]);
  useEffect(()=>{
    let stopped=false,connecting=false,socket:WebSocket|null=null,retry:ReturnType<typeof setTimeout>|undefined,attempt=0;
    let pingStarted=0,lastMessage=Date.now();
    const connect=async()=>{
      if(stopped||connecting||socket&&socket.readyState<=1||document.visibilityState!=='visible')return;
      connecting=true;
      try {
        const ticket=await apiSend<{url:string}>('/api/paper/live-ticket','POST',{});if(stopped)return;
        const current=new WebSocket(ticket.url);socket=current;
        current.onopen=()=>{if(socket!==current)return;attempt=0;lastMessage=Date.now();live.current=true;setConnection('Live account');pingStarted=performance.now();current.send('ping');};
        current.onmessage=event=>{if(socket!==current)return;lastMessage=Date.now();try{const data=JSON.parse(event.data);if(data.type==='snapshot')receive(data.snapshot);if(data.type==='pong'){const rtt=performance.now()-pingStarted;setLatency(Math.round(rtt));if(Number.isFinite(Date.parse(data.server_time)))setServerOffset(Date.parse(data.server_time)+rtt/2-Date.now());}}catch{/* ignore malformed events */}};
        current.onclose=()=>{if(socket!==current)return;live.current=false;setConnection('Polling fallback');if(!stopped)retry=setTimeout(connect,Math.min(30000,1000*2**Math.min(attempt++,5)));};
        current.onerror=()=>current.close();
      }catch{live.current=false;setConnection('Polling fallback');if(!stopped)retry=setTimeout(connect,30000);}finally{connecting=false;}
    };
    const visible=()=>{if(document.visibilityState==='visible'){void refresh().catch(e=>setError(e.message));if(!socket||socket.readyState>1)void connect();}else socket?.close();};
    void connect();const stop=startVisibleInterval(()=>{if(!live.current||Date.now()-lastSync.current>=60000)return refresh().catch(e=>setError(e.message));},10000);
    const heartbeat=setInterval(()=>{if(socket?.readyState===1){if(Date.now()-lastMessage>65000)socket.close();else{pingStarted=performance.now();socket.send('ping');}}},30000);
    document.addEventListener('visibilitychange',visible);
    return()=>{stopped=true;stop();clearInterval(heartbeat);if(retry)clearTimeout(retry);socket?.close();document.removeEventListener('visibilitychange',visible);};
  },[receive,refresh]);
  const enableNotifications=async()=>{if('Notification'in window){const permission=await Notification.requestPermission();notifications.current=permission==='granted';setMessage(permission==='granted'?'Browser notifications enabled.':'Browser notifications are not enabled.');}};
  return {catalog,snapshot,quote,error,quoteError,setError,message,setMessage,connection,latency,serverOffset,refresh,refreshQuote,enableNotifications};
}

export function useCryptoStream(symbol:string|undefined,enabled:boolean,serverOffset=0) {
  const [tick,setTick]=useState<{symbol:string;price:number;at:string;bid:number;ask:number}|null>(null);
  const offset=useRef(serverOffset);offset.current=serverOffset;
  useEffect(()=>{
    setTick(null);if(!symbol||!enabled)return;
    let stopped=false,ws:WebSocket|null=null,timer:ReturnType<typeof setTimeout>|undefined;
    const connect=()=>{
      if(stopped||ws&&ws.readyState<=1||document.visibilityState!=='visible')return;
      const current=new WebSocket('wss://ws-feed.exchange.coinbase.com');ws=current;
      current.onopen=()=>current.send(JSON.stringify({type:'subscribe',product_ids:[symbol.replace(/USD$/,'-USD')],channels:['ticker']}));
      current.onmessage=event=>{if(ws!==current)return;try{const data=JSON.parse(event.data),price=Number(data.price),at=Date.parse(data.time),now=Date.now()+offset.current;if(data.type==='ticker'&&Number.isFinite(price)&&price>0&&now-at<90000&&at<now+60000)setTick({symbol,price,at:data.time,bid:Number(data.best_bid),ask:Number(data.best_ask)});}catch{/* provider messages */}};
      current.onclose=()=>{if(!stopped&&ws===current)timer=setTimeout(connect,10000);};current.onerror=()=>current.close();
    };
    const visible=()=>{if(document.visibilityState==='visible')connect();else ws?.close();};
    connect();document.addEventListener('visibilitychange',visible);
    return()=>{stopped=true;if(timer)clearTimeout(timer);ws?.close();document.removeEventListener('visibilitychange',visible);};
  },[symbol,enabled]);
  return tick;
}

import { getCatalogMarket, selectableMarketsSql } from '../shared/market-catalog.js';
import { getInstrument } from '../shared/trading-instruments.js';

const marketCache=new Map();
async function cached(key,load,ttl) {
  const entry=marketCache.get(key);if(entry&&entry.until>Date.now())return entry.value;
  const value=await load();if(marketCache.size>300)marketCache.clear();marketCache.set(key,{value,until:Date.now()+ttl});return value;
}
async function read(url) {
  const response=await fetch(url,{headers:{accept:'application/json'},signal:AbortSignal.timeout(6000)});
  if(!response.ok)throw new Error(`Provider returned ${response.status}`);return response.json();
}
export async function tradingCatalog(db) {
  const result=await db.prepare(`SELECT id,symbol,name,asset_class FROM markets WHERE ${selectableMarketsSql} ORDER BY symbol`).all();
  return (result.results||[]).map(row=>({...row,name:getCatalogMarket(row.symbol)?.name||row.name,currency:getCatalogMarket(row.symbol)?.currency}));
}
export async function marketDepth(symbol) {
  const market=getCatalogMarket(symbol);
  if(market?.provider!=='Coinbase')return {symbol,available:false,bids:[],asks:[],reason:'Exchange depth is unavailable from this market’s free quote feed.'};
  return cached(`book:${symbol}`,async()=>{
    const data=await read(`https://api.exchange.coinbase.com/products/${encodeURIComponent(market.provider_symbol)}/book?level=2`);
    const convert=rows=>(rows||[]).slice(0,12).map(([price,size,orders])=>({price:Number(price),size:Number(size),orders:Number(orders)}));
    return {symbol,available:true,source:'Coinbase level 2 snapshot',observed_at:new Date().toISOString(),sequence:data.sequence,bids:convert(data.bids),asks:convert(data.asks)};
  },10000);
}
export async function marketBars(symbol,interval='1m') {
  const market=getCatalogMarket(symbol);if(!market)throw new Error('Unknown symbol');
  const allowed={'1m':60,'5m':300,'15m':900,'1h':3600,'1d':86400};
  if(!allowed[interval])throw new Error('Unsupported interval');
  return cached(`bars:${symbol}:${interval}`,async()=>{
    try {
      let bars;
      if(market.provider==='Coinbase') {
        const data=await read(`https://api.exchange.coinbase.com/products/${market.provider_symbol}/candles?granularity=${allowed[interval]}`);
        bars=data.map(([time,low,high,open,close,volume])=>({time,open,high,low,close,volume})).sort((a,b)=>a.time-b.time);
      }else {
        const data=await read(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(market.provider_symbol)}?interval=${interval==='1h'?'60m':interval}&range=${interval==='1d'?'6mo':'5d'}`);
        const row=data.chart?.result?.[0],quotes=row?.indicators?.quote?.[0];
        bars=(row?.timestamp||[]).map((time,i)=>({time,open:quotes.open[i],high:quotes.high[i],low:quotes.low[i],close:quotes.close[i],volume:quotes.volume[i]}));
      }
      bars=bars.filter(b=>[b.time,b.open,b.high,b.low,b.close].every(Number.isFinite)).slice(-250);
      return {symbol,interval,bars,source:market.provider,available:bars.length>0};
    }catch {
      return {symbol,interval,bars:[],source:market.provider,available:false,reason:'Historical candles are temporarily unavailable. Live observed quotes can still be plotted; no history is synthesized.'};
    }
  },30000);
}

import { getCatalogMarket } from '../../shared/market-catalog.js';
import { useEffect, useRef } from 'react';

type Props = { symbol: string; price: number; change: number; interval?:string; timezone?:string };

export default function PriceChart({ symbol, interval='1d', timezone='UTC' }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const widgetId = `tv-${symbol.replace(/[^a-zA-Z0-9]/g, '-')}`;
    const notify = () => {
      const el = document.getElementById(widgetId);
      if (el) {
        const frame = el.querySelector('iframe');
        if (frame) {
          frame.setAttribute('allowtransparency', 'true');
        }
      }
    };

    const scriptId = 'tradingview-widget-script';
    const existing = document.getElementById(scriptId) as HTMLScriptElement | null;
    const loadWidget = () => {
      const tv = (window as typeof window & { TradingView?: { widget: new (options: Record<string, unknown>) => void } }).TradingView;
      if (!tv || !containerRef.current) return;
      const mapped = getCatalogMarket(symbol)?.tradingview_symbol;
      if (!mapped) return;
      const host = document.createElement('div');
      host.id = widgetId;
      host.style.width = '100%';
      host.style.height = '100%';
      containerRef.current.innerHTML = '';
      containerRef.current.appendChild(host);
      new tv.widget({
        autosize: true,
        symbol: mapped,
        interval: ({'1m':'1','5m':'5','15m':'15','1h':'60','1d':'D'})[interval]||'D',
        timezone: timezone==='UTC'?'Etc/UTC':timezone,
        theme: 'dark',
        style: '1',
        locale: 'en',
        toolbar_bg: '#0b0d12',
        enable_publishing: false,
        hide_top_toolbar: false,
        hide_legend: false,
        save_image: false,
        allow_symbol_change: false,
        withdateranges: true,
        details: false,
        container_id: widgetId,
        studies: [],
        watchlist: [],
        logo: 'none',
      });
      setTimeout(notify, 300);
    };

    if (existing) {
      if ((window as typeof window & { TradingView?: unknown }).TradingView) {
        loadWidget();
      } else {
        existing.addEventListener('load', loadWidget, { once: true });
      }
      return;
    }

    const script = document.createElement('script');
    script.id = scriptId;
    script.src = 'https://s3.tradingview.com/tv.js';
    script.async = true;
    script.onload = loadWidget;
    document.body.appendChild(script);

    return () => {
      if (containerRef.current) containerRef.current.innerHTML = '';
    };
  }, [symbol,interval,timezone]);

  if (!getCatalogMarket(symbol)) return <div className="flex h-full items-center justify-center text-sm text-stone-500">No verified chart is available for this symbol.</div>;

  return <div ref={containerRef} className="h-full w-full overflow-hidden" />;
}

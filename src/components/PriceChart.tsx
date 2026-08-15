import { useEffect, useRef } from 'react';

type Props = { symbol: string; price: number; change: number };

function mapSymbolToTradingView(symbol: string) {
  const upper = symbol.toUpperCase();

  if (/^(BTC|ETH|SOL|XRP|ADA|DOGE|BNB|LINK|AVAX|DOT|MATIC|LTC|TRX|ATOM|BCH|XLM|XMR|ZEC|ETC|NEAR|ICP|FIL|ALGO|VET|UNI|AAVE|COMP|INJ|ARB|OP|APT|SUI|TIA|GALA|SAND|MANA|AXS|IMX|GRT|CRV|PEPE|SHIB|XAU|XAG|XPT|XPD)/.test(upper)) {
    if (upper === 'BTCUSD') return 'BITSTAMP:BTCUSD';
    if (upper === 'ETHUSD') return 'BITSTAMP:ETHUSD';
    if (upper === 'SOLUSD') return 'BINANCE:SOLUSDT';
    if (upper === 'XRPUSD') return 'BINANCE:XRPUSDT';
    if (upper === 'ADAUSD') return 'BINANCE:ADAUSDT';
    if (upper === 'DOGEUSD') return 'BINANCE:DOGEUSDT';
    if (upper === 'XAUUSD') return 'OANDA:XAUUSD';
    if (upper === 'XAGUSD') return 'OANDA:XAGUSD';
    if (upper === 'XPTUSD') return 'OANDA:XPTUSD';
    if (upper === 'XPDUSD') return 'OANDA:XPDUSD';
    return `BINANCE:${upper.replace('USD', 'USDT')}`;
  }

  if (/^(EURUSD|GBPUSD|USDJPY|AUDUSD|USDCAD|USDCHF|NZDUSD|EURGBP|EURJPY|GBPJPY|AUDJPY|EURCHF|EURAUD|EURCAD|EURNZD|EURSEK|EURNOK|EURPLN|GBPCHF|GBPAUD|GBPCAD|GBPNZD|CHFJPY|CADJPY|NZDJPY|USDCNH|USDMXN|USDZAR|USDSEK|USDNOK|USDPLN|USDSGD|USDHKD|USDTRY)$/.test(upper)) {
    return `OANDA:${upper}`;
  }

  if (/^(ES|NQ|YM|RTY|GC|SI|CL|NG|HG|BZ|6E|6J|6B|6A)$/.test(upper)) {
    const mapping: Record<string, string> = {
      ES: 'CME_MINI:ES1!',
      NQ: 'CME_MINI:NQ1!',
      YM: 'CBOT:YM1!',
      RTY: 'CME_MINI:RTY1!',
      GC: 'COMEX:GC1!',
      SI: 'COMEX:SI1!',
      CL: 'NYMEX:CL1!',
      NG: 'NYMEX:NG1!',
      HG: 'COMEX:HG1!',
      BZ: 'NYMEX:BZ1!',
      '6E': 'CME:6E1!',
      '6J': 'CME:6J1!',
      '6B': 'CME:6B1!',
      '6A': 'CME:6A1!',
    };
    return mapping[upper] || upper;
  }

  if (/\.TO$/.test(upper)) return `TSX:${upper.replace('.TO', '')}`;
  if (/^\d/.test(upper)) return upper;
  return `NASDAQ:${upper}`;
}

export default function PriceChart({ symbol }: Props) {
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
      const mapped = mapSymbolToTradingView(symbol);
      const host = document.createElement('div');
      host.id = widgetId;
      host.style.width = '100%';
      host.style.height = '100%';
      containerRef.current.innerHTML = '';
      containerRef.current.appendChild(host);
      new tv.widget({
        autosize: true,
        symbol: mapped,
        interval: 'D',
        timezone: 'Etc/UTC',
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
  }, [symbol]);

  return <div ref={containerRef} className="h-full w-full overflow-hidden" />;
}

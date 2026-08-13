import { useEffect, useMemo, useRef } from 'react';
import { formatPrice } from '../lib/format';

type Props = { symbol: string; price: number; change: number };

function walk(seed: number, n: number) {
  const out = [seed];
  let p = seed;
  for (let i = 1; i < n; i++) {
    p = p * (1 + (Math.sin(i * 0.35 + seed) * 0.0018 + (Math.random() - 0.48) * 0.0035));
    out.push(p);
  }
  return out;
}

export default function PriceChart({ symbol, price, change }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const series = useMemo(() => {
    const base = walk(price / (1 + change / 100), 80);
    base[base.length - 1] = price;
    return base;
  }, [symbol]); // eslint-disable-line react-hooks/exhaustive-deps

  const dataRef = useRef(series);
  dataRef.current = [...dataRef.current.slice(-119), price];

  useEffect(() => {
    dataRef.current = series;
  }, [symbol, series]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    let raf = 0;

    const draw = () => {
      const dpr = devicePixelRatio || 1;
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
        canvas.width = w * dpr;
        canvas.height = h * dpr;
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);

      const vals = dataRef.current;
      const min = Math.min(...vals);
      const max = Math.max(...vals);
      const span = max - min || 1;
      const pad = 16;
      const up = vals[vals.length - 1] >= vals[0];
      const stroke = up ? '#34d399' : '#fb7185';

      ctx.strokeStyle = 'rgba(255,255,255,0.05)';
      ctx.lineWidth = 1;
      for (let i = 0; i < 5; i++) {
        const y = pad + ((h - pad * 2) * i) / 4;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
        ctx.stroke();
      }

      ctx.beginPath();
      vals.forEach((v, i) => {
        const x = (i / (vals.length - 1)) * w;
        const y = pad + (1 - (v - min) / span) * (h - pad * 2);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.strokeStyle = stroke;
      ctx.lineWidth = 2;
      ctx.stroke();

      const lastY = pad + (1 - (vals[vals.length - 1] - min) / span) * (h - pad * 2);
      const grad = ctx.createLinearGradient(0, pad, 0, h);
      grad.addColorStop(0, up ? 'rgba(52,211,153,0.18)' : 'rgba(251,113,133,0.16)');
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.lineTo(w, h);
      ctx.lineTo(0, h);
      ctx.closePath();
      ctx.fillStyle = grad;
      ctx.fill();

      ctx.fillStyle = stroke;
      ctx.beginPath();
      ctx.arc(w - 2, lastY, 3.5, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = 'rgba(232,230,225,0.45)';
      ctx.font = '11px JetBrains Mono, monospace';
      ctx.fillText(formatPrice(max), 8, pad + 4);
      ctx.fillText(formatPrice(min), 8, h - 6);

      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [symbol]);

  return <canvas ref={canvasRef} className="h-full w-full" />;
}

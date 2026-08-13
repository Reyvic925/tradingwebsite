import React, { useEffect, useRef, useState } from 'react';

type Point = { ts: string; price: number };

export default function PositionChart({ orderId }: { orderId: number | string }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [data, setData] = useState<Point[]>([]);

  useEffect(() => {
    let mounted = true;
    async function load() {
      try {
        const res = await fetch(`/api/user/order/${orderId}/chart`, { headers: { 'Content-Type': 'application/json' } });
        if (!res.ok) throw new Error('Fetch failed');
        const json = await res.json();
        if (!mounted) return;
        setData(json || []);
      } catch (err) {
        console.error(err);
      }
    }
    load();
    return () => { mounted = false; };
  }, [orderId]);

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

      if (!data || data.length === 0) {
        ctx.fillStyle = 'rgba(255,255,255,0.06)';
        ctx.fillRect(0, 0, w, h);
        ctx.fillStyle = '#e5e7eb';
        ctx.font = '12px sans-serif';
        ctx.fillText('No data', 12, 20);
        return;
      }

      const vals = data.map((d) => d.price);
      const min = Math.min(...vals);
      const max = Math.max(...vals);
      const span = max - min || 1;
      const pad = 12;

      ctx.beginPath();
      data.forEach((p, i) => {
        const x = (i / (data.length - 1)) * (w - pad * 2) + pad;
        const y = pad + (1 - (p.price - min) / span) * (h - pad * 2);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.strokeStyle = '#60a5fa';
      ctx.lineWidth = 2;
      ctx.stroke();

      // draw area
      ctx.lineTo(w - pad, h - pad);
      ctx.lineTo(pad, h - pad);
      ctx.closePath();
      const grad = ctx.createLinearGradient(0, pad, 0, h);
      grad.addColorStop(0, 'rgba(96,165,250,0.12)');
      grad.addColorStop(1, 'rgba(96,165,250,0)');
      ctx.fillStyle = grad;
      ctx.fill();

      // axes
      ctx.fillStyle = 'rgba(229,231,235,0.9)';
      ctx.font = '11px monospace';
      ctx.fillText((max).toFixed(2), 8, pad + 8);
      ctx.fillText((min).toFixed(2), 8, h - pad - 2);

      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [data]);

  return <canvas ref={canvasRef} className="w-full h-56" />;
}

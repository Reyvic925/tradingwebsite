import React, { useEffect, useState } from 'react';
import { apiList } from '../lib/api';
import PositionChart from '../components/PositionChart';

export default function GainsLosses() {
  const [positions, setPositions] = useState<any[]>([]);
  const [tab, setTab] = useState<'gains' | 'losses'>('gains');
  const [selectedId, setSelectedId] = useState<number | null>(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const items = await apiList<any>('/api/positions');
        if (!mounted) return;
        setPositions(items);
      } catch (err) {
        console.error(err);
      }
    })();
    return () => { mounted = false; };
  }, []);

  const gains = positions.filter((p) => Number(p.pnl || 0) > 0);
  const losses = positions.filter((p) => Number(p.pnl || 0) < 0);

  const list = tab === 'gains' ? gains : losses;

  return (
    <div className="p-4">
      <h2 className="text-xl font-semibold mb-4">Gains & Losses</h2>
      <div className="mb-4">
        <button className={`px-3 py-1 mr-2 ${tab==='gains' ? 'bg-blue-500 text-white rounded' : 'bg-gray-100'}`} onClick={() => setTab('gains')}>Gains ({gains.length})</button>
        <button className={`px-3 py-1 ${tab==='losses' ? 'bg-blue-500 text-white rounded' : 'bg-gray-100'}`} onClick={() => setTab('losses')}>Losses ({losses.length})</button>
      </div>

      <div className="space-y-2">
        {list.length === 0 && <div className="text-sm text-gray-500">No positions in this tab</div>}
        {list.map((p) => (
          <div key={p.id} className="p-3 border rounded flex justify-between items-center">
            <div>
              <div className="font-medium">{p.symbol} · {p.side}</div>
              <div className="text-sm text-gray-500">Qty: {p.quantity} · Entry: {Number(p.entry_price).toFixed(2)}</div>
            </div>
            <div className="text-right">
              <div className={`${Number(p.pnl) >= 0 ? 'text-green-500' : 'text-red-500'} font-semibold`}>{Number(p.pnl || 0).toFixed(2)} USD</div>
              <button className="mt-2 px-2 py-1 bg-gray-100 rounded" onClick={() => setSelectedId(p.id)}>Chart</button>
            </div>
          </div>
        ))}
      </div>

      {selectedId != null && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded shadow max-w-2xl w-full p-4">
            <div className="flex justify-between items-center mb-2">
              <h3 className="text-lg font-medium">Position Chart</h3>
              <button className="px-2 py-1 bg-gray-100 rounded" onClick={() => setSelectedId(null)}>Close</button>
            </div>
            <PositionChart orderId={selectedId} />
          </div>
        </div>
      )}
    </div>
  );
}

import { useEffect, useRef, useState } from 'react';
import { apiGet, apiSend } from './api';

export function useTraderWatchlist() {
  const [ids, setIds] = useState<number[]>([]);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState<number[]>([]);
  const [error, setError] = useState('');
  const inFlight = useRef(new Set<number>());

  useEffect(() => {
    let active = true;
    const sync = (event: Event) => setIds((event as CustomEvent<number[]>).detail);
    window.addEventListener('trader-watchlist-change', sync);
    apiGet<{ trader_ids: number[] }>('/api/trader-watchlist')
      .then(data => { if (active) setIds(data.trader_ids); })
      .catch(error => { if (active) setError(error.message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; window.removeEventListener('trader-watchlist-change', sync); };
  }, []);

  const toggle = async (id: number) => {
    if (loading || inFlight.current.has(id)) return;
    const saved = ids.includes(id);
    inFlight.current.add(id);
    setPending(current => [...current, id]);
    setError('');
    try {
      await apiSend(`/api/trader-watchlist?traderId=${id}`, saved ? 'DELETE' : 'PUT');
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Unable to update watchlist.');
    } finally {
      inFlight.current.delete(id);
      setPending(current => current.filter(value => value !== id));
      // Refresh after the last in-flight write so out-of-order responses cannot drop saves.
      if (inFlight.current.size === 0) {
        try {
          const data = await apiGet<{ trader_ids: number[] }>('/api/trader-watchlist');
          window.dispatchEvent(new CustomEvent('trader-watchlist-change', { detail: data.trader_ids }));
        } catch (error) {
          setError(error instanceof Error ? error.message : 'Unable to refresh watchlist.');
        }
      }
    }
  };
  return { ids, loading, pending, error, toggle };
}

import { useEffect, useState } from 'react';
import { apiGet } from '../lib/api';
import { formatPrice } from '../lib/format';
import { startVisibleInterval } from '../lib/visible-interval';

type Quote = { asset: string; price: number | null; source: string; at: string | null };

export default function TraderLivePrices({ traderId }: { traderId: number }) {
  const [quotes, setQuotes] = useState<Quote[]>([]);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    const refresh = async () => {
      try {
        const data = await apiGet<Quote[]>(`/api/trader-quotes?traderId=${traderId}`);
        if (active) { setQuotes(data); setError(''); }
      } catch {
        if (active) { setQuotes([]); setError('Current quotes are unavailable.'); }
      }
    };
    const stop = startVisibleInterval(refresh, 15000);
    return () => { active = false; stop(); };
  }, [traderId]);
  return <section className="mb-6 rounded-xl border border-amber-200/15 bg-[#10151d] p-5">
    <h2 className="text-sm font-medium text-amber-50">Current market quotes</h2>
    <p className="mt-2 text-xs text-gray-400">Activity below records entry and exit prices at execution time. These quotes show the latest available price and its timestamp.</p>
    {error && <p role="status" className="mt-3 text-xs text-amber-200">{error}</p>}
    {!quotes.length && !error && <p className="mt-3 text-xs text-gray-500">Loading current quotes...</p>}
    <dl className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
      {quotes.map(quote => <div key={quote.asset}>
        <dt className="text-xs text-gray-400">{quote.asset}</dt>
        <dd className="mt-1 font-mono text-lg text-white">{quote.price === null ? 'Unavailable' : formatPrice(quote.price)}</dd>
        <div className="mt-1 text-[10px] leading-relaxed text-gray-500">{quote.source}
          {quote.at && <span className="block">{new Date(quote.at).toLocaleString(undefined, { timeZoneName: 'short' })}</span>}
        </div>
      </div>)}
    </dl>
  </section>;
}

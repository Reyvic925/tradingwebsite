import { Bookmark } from 'lucide-react';

export default function TraderWatchButton({ name, saved, disabled, onClick }: {
  name: string;
  saved: boolean;
  disabled: boolean;
  onClick: () => void;
}) {
  return <button type="button" onClick={onClick} disabled={disabled} aria-pressed={saved}
    aria-label={`${saved ? 'Remove' : 'Save'} ${name} ${saved ? 'from' : 'to'} watchlist`}
    title={saved ? 'Saved to watchlist' : 'Save to watchlist'}
    className={`flex shrink-0 items-center gap-2 rounded-lg border p-2 text-xs transition disabled:opacity-40 ${saved ? 'border-amber-200/40 bg-amber-200/10 text-amber-200' : 'border-white/10 text-gray-400 hover:border-amber-200/40 hover:text-amber-100'}`}>
    <Bookmark size={16} fill={saved ? 'currentColor' : 'none'} />
  </button>;
}

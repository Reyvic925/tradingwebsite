import { Link } from 'react-router-dom';
import { BRAND } from '../lib/brand';

type Props = { to?: string; compact?: boolean; className?: string };

export default function Logo({ to = '/', compact = false, className = '' }: Props) {
  const inner = (
    <>
      <span className="grid h-8 w-8 place-items-center rounded-sm bg-gradient-to-br from-amber-200 to-amber-600 text-[#1a1304] shadow-[0_0_20px_rgba(212,175,55,0.3)] sm:h-9 sm:w-9">
        <svg viewBox="0 0 24 24" className="h-4 w-4 sm:h-5 sm:w-5" fill="none" stroke="currentColor" strokeWidth="1.8">
          <path d="M4 16l5-6 4 4 7-9" />
          <path d="M15 5h5v5" />
        </svg>
      </span>
      <div className="leading-tight">
        <div className="font-display text-lg tracking-wide text-stone-50 sm:text-xl">{BRAND.name}</div>
        {!compact && (
          <div className="text-[9px] uppercase tracking-[0.32em] text-amber-300/80">{BRAND.product}</div>
        )}
      </div>
    </>
  );

  if (to.startsWith('#')) {
    return <a href={to} className={`flex items-center gap-2.5 ${className}`}>{inner}</a>;
  }
  return <Link to={to} className={`flex items-center gap-2.5 ${className}`}>{inner}</Link>;
}

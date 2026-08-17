import { Link } from 'react-router-dom';
import { BRAND } from '../lib/brand';

type Props = { to?: string; compact?: boolean; className?: string };

export default function Logo({ to = '/', compact = false, className = '' }: Props) {
  const inner = (
    <span className={`relative block h-9 overflow-hidden rounded-sm bg-white sm:h-10 ${compact ? 'w-36 sm:w-40' : 'w-44 sm:w-56'}`}>
      <img
        src="/favicon.png"
        alt={BRAND.name}
        className={`absolute left-1/2 top-1/2 max-w-none -translate-x-1/2 -translate-y-1/2 ${compact ? 'w-72 sm:w-80' : 'w-[22rem] sm:w-[28rem]'}`}
      />
    </span>
  );

  if (to.startsWith('#')) {
    return <a href={to} className={`flex items-center gap-2.5 ${className}`}>{inner}</a>;
  }
  return <Link to={to} className={`flex items-center gap-2.5 ${className}`}>{inner}</Link>;
}

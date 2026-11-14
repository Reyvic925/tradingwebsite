import { useState } from 'react';

type TraderAvatarProps = {
  name?: string | null;
  src?: string | null;
  className: string;
};

function initials(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join('') || '?';
}

export default function TraderAvatar({ name = '', src, className }: TraderAvatarProps) {
  const [failedSource, setFailedSource] = useState<string | null>(null);
  if (src?.trim() && failedSource !== src) {
    return <img src={src} alt={name || 'Trader'} onError={() => setFailedSource(src)} className={className} />;
  }

  return (
    <div
      style={{ backgroundImage: 'url(/images/traders/monogram-texture.png)', backgroundSize: 'cover', backgroundPosition: 'center' }}
      role="img"
      aria-label={`${name || 'Trader'} monogram`}
      className={`${className} flex items-center justify-center border border-amber-200/25 bg-[#101214] font-serif font-medium tracking-wider text-amber-100 shadow-inner`}
    >
      <span>{initials(name || '')}</span>
    </div>
  );
}

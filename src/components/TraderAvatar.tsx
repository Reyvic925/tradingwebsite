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
  if (src?.trim()) {
    return <img src={src} alt={name || 'Trader'} className={className} />;
  }

  return (
    <div
      role="img"
      aria-label={`${name || 'Trader'} profile photo not provided`}
      className={`${className} flex items-center justify-center bg-white/10 font-semibold text-gray-300`}
    >
      {initials(name || '')}
    </div>
  );
}

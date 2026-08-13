import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Menu, X } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import Logo from './Logo';

const links = [
  { href: '#markets', label: 'Markets' },
  { href: '#features', label: 'Platform' },
  { href: '#plans', label: 'Plans' },
  { href: '#proof', label: 'Proof' },
  { href: '#trust', label: 'Trust' },
  { href: '/source', label: 'Source' },
];

export default function Navbar() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 16);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <header className={`fixed inset-x-0 top-0 z-50 transition ${scrolled ? 'border-b border-white/5 bg-[#05070b]/80 backdrop-blur-xl' : ''}`}>
      <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-4 lg:px-8">
        <Logo to="#top" />

        <nav className="hidden items-center gap-8 md:flex">
          {links.map((l) => (
            <a key={l.href} href={l.href} className="text-xs uppercase tracking-[0.18em] text-stone-300/80 transition hover:text-amber-200">
              {l.label}
            </a>
          ))}
        </nav>

        <div className="hidden items-center gap-3 md:flex">
          {user ? (
            <Link to="/app" className="rounded-sm bg-amber-400 px-4 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-[#1a1304] transition hover:bg-amber-300">
              Terminal
            </Link>
          ) : (
            <>
              <Link to="/login" className="text-xs uppercase tracking-[0.18em] text-stone-300 hover:text-white">
                Sign in
              </Link>
              <Link to="/login?mode=signup" className="rounded-sm bg-amber-400 px-4 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-[#1a1304] transition hover:bg-amber-300">
                Open account
              </Link>
            </>
          )}
        </div>

        <button className="md:hidden text-stone-200" onClick={() => setOpen((v) => !v)} aria-label="Menu">
          {open ? <X size={22} /> : <Menu size={22} />}
        </button>
      </div>

      {open && (
        <div className="glass mx-4 rounded-md p-4 md:hidden">
          <div className="flex flex-col gap-3">
            {links.map((l) => (
              <a key={l.href} href={l.href} onClick={() => setOpen(false)} className="text-sm text-stone-200">
                {l.label}
              </a>
            ))}
            <Link to={user ? '/app' : '/login'} className="rounded-sm bg-amber-400 px-4 py-2 text-center text-xs font-semibold uppercase tracking-widest text-[#1a1304]">
              {user ? 'Terminal' : 'Open account'}
            </Link>
          </div>
        </div>
      )}
    </header>
  );
}

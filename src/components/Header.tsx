import React, { useEffect, useRef, useState } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { BRANDING } from '../constants';
import { useAuth } from '../hooks/useAuth';
import { authService } from '../services';

interface HeaderProps {
  /** Hides the logo (the dashboard animates its own large logo into place). */
  hideBranding?: boolean;
}

const Header: React.FC<HeaderProps> = ({ hideBranding = false }) => {
  const { user, logout, can } = useAuth();
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', esc);
    };
  }, []);

  const links = [
    { to: '/', label: 'Home' },
    { to: '/monitoring', label: 'Cameras' },
    { to: '/analysis', label: 'Incidents' },
    { to: '/archive', label: 'Archive' },
    { to: '/catalog', label: 'Footage' },
    ...(can('logs:view') ? [{ to: '/history', label: 'Access Log' }] : []),
  ];

  const signOut = () => {
    setOpen(false);
    logout();
    navigate('/login');
  };

  const linkClass = ({ isActive }: { isActive: boolean }) =>
    `px-3 py-1.5 rounded-lg text-[11px] font-bold uppercase tracking-wider transition-colors ${
      isActive ? 'bg-red-50 text-red-600' : 'text-zinc-500 hover:text-zinc-900'
    }`;

  return (
    <header className="w-full h-16 border-b border-zinc-100 flex items-center justify-between gap-4 px-4 sm:px-8 bg-white/95 backdrop-blur sticky top-0 z-40">
      <Link
        to="/"
        className={`flex items-center gap-3 shrink-0 transition-all duration-300 ${
          hideBranding ? 'opacity-0 pointer-events-none -translate-x-4' : 'opacity-100'
        }`}
        tabIndex={hideBranding ? -1 : 0}
      >
        <div className="w-10 h-10 rounded-xl flex items-center justify-center overflow-hidden bg-zinc-50 border border-zinc-100 p-1.5">
          <img src={BRANDING.logoUrl} alt="" className="w-full h-full object-contain" />
        </div>
        <div className="hidden sm:flex flex-col -space-y-1">
          <span className="font-black tracking-tighter text-gray-900 uppercase italic text-xl">
            RedOn<span className="text-red-600">Track</span>
          </span>
          <span className="text-[8px] font-bold text-zinc-400 uppercase tracking-[0.3em] mono ml-0.5">Station Monitor</span>
        </div>
      </Link>

      <nav className="hidden lg:flex items-center gap-1" aria-label="Main">
        {links.map((l) => (
          <NavLink key={l.to} to={l.to} end={l.to === '/'} className={linkClass}>
            {l.label}
          </NavLink>
        ))}
      </nav>

      <div className="relative" ref={menuRef}>
        <button
          onClick={() => setOpen(!open)}
          aria-expanded={open}
          aria-haspopup="menu"
          className={`flex items-center gap-2 p-1 pl-3 rounded-full border transition-all ${
            open ? 'border-red-500 bg-red-50' : 'border-zinc-200 hover:border-red-200 hover:bg-red-50'
          }`}
        >
          <span className="text-xs font-bold text-gray-700 max-w-[120px] truncate">{user?.name ?? 'Guest'}</span>
          <span className="w-8 h-8 rounded-full bg-zinc-900 text-white flex items-center justify-center text-[11px] font-black">
            {(user?.name ?? '?')
              .split(' ')
              .map((p) => p[0])
              .slice(0, 2)
              .join('')}
          </span>
        </button>

        {open && user && (
          <div role="menu" className="absolute right-0 mt-2 w-60 bg-white border border-zinc-100 rounded-xl shadow-2xl py-2 z-50 animate-in fade-in slide-in-from-top-2 duration-200">
            <div className="px-4 py-2 border-b border-zinc-100 mb-1">
              <p className="text-xs font-black text-gray-900">{user.name}</p>
              <p className="text-[10px] text-zinc-500 mono">
                ID {user.id} · {user.position}
              </p>
              <p className="mt-1 inline-block text-[9px] font-black uppercase tracking-widest text-red-600 bg-red-50 border border-red-100 rounded-full px-2 py-0.5">
                {authService.ROLE_LABELS[user.role]}
              </p>
            </div>
            <div className="lg:hidden border-b border-zinc-100 pb-1 mb-1">
              {links.map((l) => (
                <Link
                  key={l.to}
                  to={l.to}
                  role="menuitem"
                  onClick={() => setOpen(false)}
                  className="block px-4 py-2 text-xs font-semibold text-gray-600 hover:bg-red-50 hover:text-red-600"
                >
                  {l.label}
                </Link>
              ))}
            </div>
            <button
              role="menuitem"
              onClick={signOut}
              className="w-full text-left px-4 py-2 text-xs font-bold text-red-600 hover:bg-red-600 hover:text-white transition-colors"
            >
              Sign out
            </button>
          </div>
        )}
      </div>
    </header>
  );
};

export default Header;

import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from './auth';
import { BRAND } from './brand';
import { notFoundMeta, pageFor } from './meta';
import { usePageMeta } from './usePageMeta';
import { CookieBanner, useConsent } from './consent';

function Account() {
  const { user, loading, requireUser, signOut } = useAuth();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    window.addEventListener('mousedown', close);
    return () => window.removeEventListener('mousedown', close);
  }, [open]);

  if (loading) return <span className="account-placeholder" />;
  if (!user?.complete) {
    return <button type="button" className="btn btn-header" onClick={() => requireUser()}>Sign in</button>;
  }
  const initials = (user.name ?? '?').split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase();
  return (
    <div className="account" ref={ref}>
      <button type="button" className="account-btn" aria-expanded={open} aria-haspopup="menu" onClick={() => setOpen(!open)}>
        <span className="avatar">{initials}</span>
        <span className="account-name">{user.name?.split(' ')[0]}</span>
      </button>
      {open && (
        <div className="account-menu" role="menu">
          <p className="account-meta">{user.name}<br /><span>{user.phone}</span></p>
          <Link role="menuitem" to="/designs" onClick={() => setOpen(false)}>Your designs</Link>
          <button role="menuitem" type="button" onClick={() => { setOpen(false); signOut(); }}>Sign out</button>
        </div>
      )}
    </div>
  );
}

export function Layout() {
  const { pathname } = useLocation();
  const app = pathname.startsWith('/visualize');
  useEffect(() => { if (!app) window.scrollTo(0, 0); }, [pathname, app]);
  usePageMeta(pageFor(pathname.replace(/\/+$/, '') || '/') ?? notFoundMeta);
  const consent = useConsent();

  return (
    <div className={`site${app ? ' site-app' : ''}`}>
      <header className="site-header">
        <Link to="/" className="site-wordmark">{BRAND.name}</Link>
        <nav className="site-nav" aria-label="Main">
          <NavLink to="/collection">Collection</NavLink>
          <NavLink to="/visualize"><span className="nav-long">See it on your wall</span><span className="nav-short">Visualize</span></NavLink>
          <a href="/#showroom">Showroom</a>
        </nav>
        <Account />
      </header>
      <main className={app ? 'site-main-app' : 'site-main'}>
        <Outlet />
      </main>
      {!app && (
        <footer className="site-footer">
          <div>
            <p className="site-wordmark">{BRAND.name}</p>
            <p>{BRAND.tagline}</p>
          </div>
          <nav aria-label="Footer">
            <Link to="/collection">Collection</Link>
            <Link to="/visualize">See it on your wall</Link>
            <Link to="/designs">Your designs</Link>
            <a href="/#showroom">Visit the showroom</a>
          </nav>
          <nav aria-label="Legal" className="site-footer-legal">
            <Link to="/privacy">Privacy</Link>
            <Link to="/terms">Terms</Link>
            <Link to="/cookies">Cookies</Link>
            <button type="button" className="link-quiet" onClick={consent.openSettings}>Cookie settings</button>
          </nav>
          <p className="site-footer-note">© {new Date().getFullYear()} {BRAND.name}. Slab images, sizes and sample rooms on this site are placeholders for the pitch.</p>
        </footer>
      )}
      <CookieBanner />
    </div>
  );
}

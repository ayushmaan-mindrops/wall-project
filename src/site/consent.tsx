import { type ReactNode, createContext, useCallback, useContext, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { BRAND } from './brand';

/**
 * Cookie consent. The site needs only two strictly necessary cookies (the
 * sign-in session and this choice itself), so nothing optional runs until the
 * visitor opts in. Analytics (GA4, if VITE_GA_ID is set) loads only after
 * "Accept all" or an explicit analytics opt-in, and can be withdrawn anytime.
 */
interface Consent { analytics: boolean; at: string }
interface Ctx {
  ready: boolean;
  consent: Consent | null;
  save: (c: { analytics: boolean }) => void;
  openSettings: () => void;
  settingsOpen: boolean;
  closeSettings: () => void;
}

const COOKIE = 'mindrops_consent';
const MAX_AGE = 180 * 86400;
const GA_ID = import.meta.env.VITE_GA_ID as string | undefined;

function read(): Consent | null {
  const m = document.cookie.match(new RegExp(`(?:^|; )${COOKIE}=([^;]*)`));
  if (!m) return null;
  try { return JSON.parse(decodeURIComponent(m[1])); } catch { return null; }
}

function write(c: Consent) {
  const secure = location.protocol === 'https:' ? '; Secure' : '';
  document.cookie = `${COOKIE}=${encodeURIComponent(JSON.stringify(c))}; Path=/; Max-Age=${MAX_AGE}; SameSite=Lax${secure}`;
}

function loadAnalytics() {
  if (!GA_ID || document.getElementById('ga')) return;
  const w = window as unknown as { dataLayer: unknown[]; gtag: (...a: unknown[]) => void };
  w.dataLayer = w.dataLayer || [];
  w.gtag = function gtag() { w.dataLayer.push(arguments); }; // eslint-disable-line prefer-rest-params
  w.gtag('consent', 'default', { ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied', analytics_storage: 'granted' });
  w.gtag('js', new Date());
  w.gtag('config', GA_ID, { anonymize_ip: true });
  const s = document.createElement('script');
  s.id = 'ga';
  s.async = true;
  s.src = `https://www.googletagmanager.com/gtag/js?id=${GA_ID}`;
  document.head.appendChild(s);
}

function clearAnalyticsCookies() {
  for (const c of document.cookie.split('; ')) {
    const name = c.split('=')[0];
    if (name.startsWith('_ga')) document.cookie = `${name}=; Path=/; Max-Age=0; Domain=.${location.hostname}`;
  }
}

const ConsentCtx = createContext<Ctx | null>(null);
export const useConsent = () => useContext(ConsentCtx)!;

export function ConsentProvider({ children }: { children: ReactNode }) {
  // Read after mount so the prerendered HTML and the first browser render match.
  const [consent, setConsent] = useState<Consent | null>(null);
  const [ready, setReady] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  useEffect(() => { setConsent(read()); setReady(true); }, []);

  useEffect(() => { if (consent?.analytics) loadAnalytics(); }, [consent]);

  const save = useCallback((c: { analytics: boolean }) => {
    const next = { analytics: c.analytics, at: new Date().toISOString() };
    write(next);
    if (!next.analytics) clearAnalyticsCookies();
    setConsent(next);
    setSettingsOpen(false);
  }, []);

  return (
    <ConsentCtx.Provider value={{ ready, consent, save, settingsOpen, openSettings: () => setSettingsOpen(true), closeSettings: () => setSettingsOpen(false) }}>
      {children}
    </ConsentCtx.Provider>
  );
}

export function CookieBanner() {
  const { ready, consent, save, settingsOpen, closeSettings } = useConsent();
  const [choosing, setChoosing] = useState(false);
  const [analytics, setAnalytics] = useState(consent?.analytics ?? false);

  useEffect(() => { if (settingsOpen) { setChoosing(true); setAnalytics(consent?.analytics ?? false); } }, [settingsOpen, consent]);

  if (!ready || (consent && !settingsOpen)) return null;
  const detailed = choosing || settingsOpen;

  return (
    <section className="cookie" role="region" aria-label="Cookie preferences">
      <div className="cookie-body">
        <h2 className="cookie-title">Cookies on {BRAND.name}</h2>
        <p>
          We use a few cookies that the site needs to work, like keeping you signed in. With your permission we'd also like to
          measure how the site is used, so we can improve it. <Link to="/cookies">Read the cookie policy</Link>.
        </p>
        {detailed && (
          <div className="cookie-options">
            <label className="cookie-option">
              <input type="checkbox" checked disabled />
              <span><strong>Necessary</strong> Sign-in and remembering this choice. Always on.</span>
            </label>
            <label className="cookie-option">
              <input type="checkbox" checked={analytics} onChange={(e) => setAnalytics(e.target.checked)} />
              <span><strong>Analytics</strong> Anonymous counts of visits and the pages people use.</span>
            </label>
          </div>
        )}
      </div>
      <div className="cookie-actions">
        {detailed ? (
          <>
            <button type="button" className="btn" onClick={() => { save({ analytics: false }); setChoosing(false); }}>Necessary only</button>
            <button type="button" className="btn btn-primary" onClick={() => { save({ analytics }); setChoosing(false); }}>Save choices</button>
            {settingsOpen && consent && <button type="button" className="btn btn-quiet" onClick={() => { closeSettings(); setChoosing(false); }}>Cancel</button>}
          </>
        ) : (
          <>
            <button type="button" className="btn btn-quiet" onClick={() => setChoosing(true)}>Choose</button>
            <button type="button" className="btn" onClick={() => save({ analytics: false })}>Necessary only</button>
            <button type="button" className="btn btn-primary" onClick={() => save({ analytics: true })}>Accept all</button>
          </>
        )}
      </div>
    </section>
  );
}

import { type FormEvent, type ReactNode, createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { ApiError, ROLES, type User, api } from './api';
import { Sheet } from './Sheet';
import { BRAND } from './brand';
import { Link } from 'react-router-dom';

interface AuthContext {
  user: User | null;
  loading: boolean;
  /** Resolve with a signed-in user with a complete profile, asking them to sign in if needed; null if they close the sheet. */
  requireUser: (reason?: string) => Promise<User | null>;
  signOut: () => Promise<void>;
}

const Ctx = createContext<AuthContext | null>(null);
export const useAuth = () => useContext(Ctx)!;

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [sheet, setSheet] = useState<{ reason: string } | null>(null);
  const waiting = useRef<((u: User | null) => void) | null>(null);
  const current = useRef<User | null>(null);
  current.current = user;

  useEffect(() => {
    api<{ user: User | null }>('/api/auth/me').then((r) => setUser(r.user)).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const requireUser = useCallback((reason?: string) => {
    const u = current.current;
    if (u?.complete) return Promise.resolve(u);
    setSheet({ reason: reason ?? 'Sign in to save designs and get quotes.' });
    return new Promise<User | null>((resolve) => { waiting.current = resolve; });
  }, []);

  const finish = useCallback((u: User | null) => {
    if (u) { setUser(u); current.current = u; }
    setSheet(null);
    waiting.current?.(u?.complete ? u : null);
    waiting.current = null;
  }, []);

  const signOut = useCallback(async () => {
    await api('/api/auth/logout', {});
    setUser(null);
  }, []);

  return (
    <Ctx.Provider value={{ user, loading, requireUser, signOut }}>
      {children}
      <Sheet open={!!sheet} onClose={() => finish(null)} label="Sign in">
        {sheet && <SignIn reason={sheet.reason} existing={user} onDone={finish} />}
      </Sheet>
    </Ctx.Provider>
  );
}

type Stage = 'phone' | 'code' | 'profile';

function SignIn({ reason, existing, onDone }: { reason: string; existing: User | null; onDone: (u: User) => void }) {
  const [stage, setStage] = useState<Stage>(existing && !existing.complete ? 'profile' : 'phone');
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [devCode, setDevCode] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(existing);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);
  const [profile, setProfile] = useState({ name: existing?.name ?? '', city: existing?.city ?? '', role: existing?.role ?? '', email: existing?.email ?? '' });

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try { await fn(); } catch (e) { setError(e instanceof ApiError ? e.message : 'Something went wrong. Check your connection and try again.'); }
    finally { setBusy(false); }
  };

  const sendCode = (e?: FormEvent, resend = false) => {
    e?.preventDefault();
    run(async () => {
      const r = await api<{ devCode?: string }>(resend ? '/api/auth/otp/resend' : '/api/auth/otp', { phone });
      setDevCode(r.devCode ?? null);
      setCode('');
      setStage('code');
      setCooldown(30);
    });
  };

  const verify = (e: FormEvent) => {
    e.preventDefault();
    run(async () => {
      const r = await api<{ user: User }>('/api/auth/verify', { phone, otp: code });
      setUser(r.user);
      if (r.user.complete) onDone(r.user);
      else setStage('profile');
    });
  };

  const saveProfile = (e: FormEvent) => {
    e.preventDefault();
    run(async () => {
      const r = await api<{ user: User }>('/api/auth/profile', profile);
      onDone(r.user);
    });
  };

  const pretty = phone.replace(/\D/g, '').slice(-10).replace(/(\d{5})(\d{5})/, '$1 $2');

  return (
    <div className="signin">
      <div className="signin-slabs" aria-hidden="true">
        {['calacatta-oro', 'nero-marquina', 'verde-alpi', 'statuario'].map((s) => <span key={s} style={{ backgroundImage: `url(/slabs/thumb/${s}.webp)` }} />)}
      </div>

      <ol className="signin-progress" aria-label="Sign-in steps">
        {(['phone', 'code', 'profile'] as Stage[]).map((s, i) => (
          <li key={s} className={s === stage ? 'is-on' : (['phone', 'code', 'profile'].indexOf(stage) > i ? 'is-done' : '')}>
            {['Your number', 'Code', 'About you'][i]}
          </li>
        ))}
      </ol>

      {stage === 'phone' && (
        <form onSubmit={sendCode} className="signin-form">
          <h2 className="sheet-title">Welcome to {BRAND.name}</h2>
          <p className="sheet-lede">{reason}</p>
          <label className="field-block">
            <span>Mobile number</span>
            <span className="phone-input">
              <span className="phone-cc">+91</span>
              <input type="tel" inputMode="numeric" autoComplete="tel-national" placeholder="98765 43210" value={phone}
                onChange={(e) => setPhone(e.target.value.replace(/[^\d\s]/g, '').slice(0, 12))} required />
            </span>
          </label>
          {error && <p className="form-error" role="alert">{error}</p>}
          <button type="submit" className="btn btn-primary btn-wide btn-lg" disabled={busy || phone.replace(/\D/g, '').length < 10}>
            {busy ? 'Sending…' : 'Send me a code'}
          </button>
          <p className="fineprint">
            We'll text a 6-digit code to sign you in. No password needed, and we never sell your number. By continuing you agree to
            our <Link to="/terms" target="_blank">terms</Link> and <Link to="/privacy" target="_blank">privacy policy</Link>.
          </p>
        </form>
      )}

      {stage === 'code' && (
        <form onSubmit={verify} className="signin-form">
          <h2 className="sheet-title">Enter your code</h2>
          <p className="sheet-lede">
            Sent to +91 {pretty}. <button type="button" className="link" onClick={() => { setStage('phone'); setError(null); }}>Change number</button>
          </p>
          <label className="field-block">
            <span>6-digit code</span>
            <input className="otp-input" autoFocus inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} required />
          </label>
          {devCode && <p className="dev-note">Test mode, no SMS is sent. Your code is <strong>{devCode}</strong>.</p>}
          {error && <p className="form-error" role="alert">{error}</p>}
          <button type="submit" className="btn btn-primary btn-wide btn-lg" disabled={busy || code.length !== 6}>
            {busy ? 'Checking…' : 'Sign in'}
          </button>
          <p className="fineprint">
            {cooldown > 0 ? `You can ask for a new code in ${cooldown} s.` : <button type="button" className="link" onClick={() => sendCode(undefined, true)} disabled={busy}>Send a new code</button>}
          </p>
        </form>
      )}

      {stage === 'profile' && (
        <form onSubmit={saveProfile} className="signin-form">
          <h2 className="sheet-title">A little about you</h2>
          <p className="sheet-lede">So our team knows who to call back{user ? ` on ${user.phone}` : ''}.</p>
          <label className="field-block">
            <span>Your name</span>
            <input autoFocus autoComplete="name" value={profile.name} onChange={(e) => setProfile({ ...profile, name: e.target.value })} required />
          </label>
          <label className="field-block">
            <span>City</span>
            <input autoComplete="address-level2" value={profile.city} onChange={(e) => setProfile({ ...profile, city: e.target.value })} required />
          </label>
          <fieldset className="field-block">
            <legend>You are</legend>
            <div className="choice-grid">
              {ROLES.map((r) => (
                <label key={r} className={`choice${profile.role === r ? ' is-on' : ''}`}>
                  <input type="radio" name="role" value={r} checked={profile.role === r} onChange={() => setProfile({ ...profile, role: r })} />
                  {r}
                </label>
              ))}
            </div>
          </fieldset>
          <label className="field-block">
            <span>Email <em>optional</em></span>
            <input type="email" autoComplete="email" value={profile.email} onChange={(e) => setProfile({ ...profile, email: e.target.value })} />
          </label>
          {error && <p className="form-error" role="alert">{error}</p>}
          <button type="submit" className="btn btn-primary btn-wide btn-lg" disabled={busy || !profile.name || !profile.city || !profile.role}>
            {busy ? 'Saving…' : 'Continue'}
          </button>
        </form>
      )}
    </div>
  );
}

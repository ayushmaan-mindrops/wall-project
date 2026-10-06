import { type FormEvent, type ReactNode, createContext, useCallback, useContext, useState } from 'react';
import { Link } from 'react-router-dom';
import { ApiError, TIMELINES, api } from './api';
import { useAuth } from './auth';
import { Sheet } from './Sheet';
import { slabById } from '../slabs';

export interface QuoteDraft {
  slabId: string;
  areaM2?: number | null;
  slabs?: number | null;
  designId?: string | null;
  image?: string | null; // thumbnail URL of the design
}

const Ctx = createContext<(d: QuoteDraft) => void>(() => {});
export const useQuote = () => useContext(Ctx);

export function QuoteProvider({ children }: { children: ReactNode }) {
  const { requireUser } = useAuth();
  const [draft, setDraft] = useState<QuoteDraft | null>(null);

  const open = useCallback(async (d: QuoteDraft) => {
    const u = await requireUser('Sign in so our team can send you a quote.');
    if (u) setDraft(d);
  }, [requireUser]);

  return (
    <Ctx.Provider value={open}>
      {children}
      <Sheet open={!!draft} onClose={() => setDraft(null)} label="Request a quote">
        {draft && <QuoteForm draft={draft} onClose={() => setDraft(null)} />}
      </Sheet>
    </Ctx.Provider>
  );
}

function QuoteForm({ draft, onClose }: { draft: QuoteDraft; onClose: () => void }) {
  const { user } = useAuth();
  const slab = slabById(draft.slabId);
  const [timeline, setTimeline] = useState<string>('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api('/api/leads', {
        slabId: draft.slabId, designId: draft.designId ?? null, areaM2: draft.areaM2 ?? null, slabs: draft.slabs ?? null, timeline, message,
      });
      setSent(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'The request did not go through. Try again.');
    } finally {
      setBusy(false);
    }
  };

  if (sent) {
    return (
      <div className="quote-done">
        <svg className="quote-done-mark" viewBox="0 0 48 48" aria-hidden="true"><circle cx="24" cy="24" r="22" /><path d="M14 24.5l7 7 13-14" /></svg>
        <h2 className="sheet-title">Request sent</h2>
        <p className="sheet-lede">
          Thank you, {user?.name?.split(' ')[0]}. Someone from our team will call you on {user?.phone} within one working day
          with a price for {slab?.name ?? 'your slab'}{draft.areaM2 ? ` across ${draft.areaM2.toFixed(1)} m²` : ''}.
        </p>
        <div className="row">
          <Link to="/designs" className="btn" onClick={onClose}>See your designs</Link>
          <button type="button" className="btn btn-primary" onClick={onClose}>Done</button>
        </div>
      </div>
    );
  }

  return (
    <form className="quote" onSubmit={submit}>
      <h2 className="sheet-title">Request a quote</h2>
      <p className="sheet-lede">We'll price the slabs, cutting and fitting, and call you back.</p>

      <div className="quote-summary">
        {draft.image
          ? <img src={draft.image} alt="Your design" />
          : <span className="quote-slab" style={{ backgroundImage: `url(${slab?.thumb})` }} />}
        <dl>
          <dt>Marble</dt><dd>{slab?.name}</dd>
          {draft.areaM2 ? <><dt>Wall area</dt><dd>{draft.areaM2.toFixed(1)} m²</dd></> : null}
          {draft.slabs ? <><dt>Slabs</dt><dd>About {draft.slabs}</dd></> : null}
          <dt>Finish</dt><dd>{slab?.finish}</dd>
        </dl>
      </div>

      <fieldset className="field-block">
        <legend>When are you planning to start?</legend>
        <div className="choice-grid">
          {TIMELINES.map((t) => (
            <label key={t} className={`choice${timeline === t ? ' is-on' : ''}`}>
              <input type="radio" name="timeline" value={t} checked={timeline === t} onChange={() => setTimeline(t)} />
              {t}
            </label>
          ))}
        </div>
      </fieldset>

      <label className="field-block">
        <span>Anything we should know? <em>optional</em></span>
        <textarea rows={3} value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Room, site address, other surfaces, a preferred time to call" />
      </label>

      <p className="quote-contact">We'll call {user?.name} on {user?.phone}.</p>
      {error && <p className="form-error" role="alert">{error}</p>}
      <button type="submit" className="btn btn-primary btn-wide btn-lg" disabled={busy || !timeline}>
        {busy ? 'Sending…' : 'Send quote request'}
      </button>
    </form>
  );
}

import { type ReactNode, useEffect, useRef } from 'react';

/** A side sheet (bottom sheet on phones) for short focused tasks: sign in, quote requests. */
export function Sheet({ open, onClose, label, children }: { open: boolean; onClose: () => void; label: string; children: ReactNode }) {
  const panel = useRef<HTMLDivElement>(null);
  const opener = useRef<Element | null>(null);

  useEffect(() => {
    if (!open) return;
    opener.current = document.activeElement;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    requestAnimationFrame(() => (panel.current?.querySelector<HTMLElement>('input, textarea') ?? panel.current?.querySelector<HTMLElement>('button'))?.focus());
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
      (opener.current as HTMLElement | null)?.focus?.();
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="sheet-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label={label} ref={panel}>
        <button type="button" className="sheet-close" onClick={onClose} aria-label="Close">
          <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M5 5l10 10M15 5L5 15" /></svg>
        </button>
        {children}
      </div>
    </div>
  );
}

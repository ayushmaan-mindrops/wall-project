import type { Process } from '../lib/useStepper';

function Mark({ state }: { state: Process['steps'][number]['state'] }) {
  if (state === 'done') {
    return (
      <svg className="mark mark-done" viewBox="0 0 16 16" aria-hidden="true">
        <circle cx="8" cy="8" r="7.25" />
        <path d="M4.8 8.3l2.1 2.1 4.3-4.6" />
      </svg>
    );
  }
  if (state === 'active') return <span className="mark mark-active" aria-hidden="true" />;
  if (state === 'error') {
    return (
      <svg className="mark mark-error" viewBox="0 0 16 16" aria-hidden="true">
        <circle cx="8" cy="8" r="7.25" />
        <path d="M5.5 5.5l5 5M10.5 5.5l-5 5" />
      </svg>
    );
  }
  return <span className="mark mark-pending" aria-hidden="true" />;
}

export function ProcessCard({ proc, onDismiss }: { proc: Process; onDismiss: () => void }) {
  const done = proc.steps.filter((s) => s.state === 'done').length;
  const progress = Math.min(1, (done + (proc.steps.some((s) => s.state === 'active') ? 0.5 : 0)) / proc.steps.length);
  return (
    <div className="proc" role="status" aria-live="polite">
      <div className="proc-head">
        <h2 className="proc-title">{proc.title}</h2>
        {proc.eta && !proc.failed && <span className="proc-eta">{proc.eta}</span>}
      </div>
      <div className="proc-bar"><span style={{ transform: `scaleX(${proc.failed ? 1 : progress})` }} className={proc.failed ? 'is-failed' : ''} /></div>
      <ol className="proc-steps">
        {proc.steps.map((s, i) => (
          <li key={i} className={`proc-step is-${s.state}`}>
            <Mark state={s.state} />
            <span className="proc-label">
              {s.label}
              {s.state === 'active' && proc.detail && <span className="proc-detail">{proc.detail}</span>}
            </span>
          </li>
        ))}
      </ol>
      {proc.failed && (
        <div className="proc-fail">
          <p>{proc.failed}</p>
          <button type="button" className="btn" onClick={onDismiss}>Close</button>
        </div>
      )}
    </div>
  );
}

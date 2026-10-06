import { useCallback, useRef, useState } from 'react';

export type StepState = 'pending' | 'active' | 'done' | 'error';

export interface Process {
  id: number;
  title: string;
  steps: { label: string; state: StepState }[];
  detail: string | null; // live detail for the active step, e.g. a download percentage
  eta: string | null;
  scan: boolean; // sweep a scan line over the photo while running
  failed: string | null;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Drives the progress card shown over the photo during longer jobs. Steps
 * advance on real events, but each is held on screen for a minimum time so
 * fast steps read as deliberate work instead of flicker.
 */
export function useStepper() {
  const [proc, setProc] = useState<Process | null>(null);
  const shownAt = useRef(0);
  const current = useRef<{ id: number; index: number } | null>(null);
  const nextId = useRef(1);

  const start = useCallback((title: string, labels: string[], opts: { eta?: string; scan?: boolean } = {}) => {
    const id = nextId.current++;
    current.current = { id, index: 0 };
    shownAt.current = performance.now();
    setProc({
      id, title, detail: null, eta: opts.eta ?? null, scan: opts.scan ?? false, failed: null,
      steps: labels.map((label, i) => ({ label, state: i === 0 ? 'active' : 'pending' })),
    });
    return id;
  }, []);

  /** Mark steps before `index` done and `index` active. No-op if it would go backwards or the process changed. */
  const advance = useCallback(async (id: number, index: number, minMs = 550) => {
    const c = current.current;
    if (!c || c.id !== id || index <= c.index) return;
    const wait = minMs - (performance.now() - shownAt.current);
    if (wait > 0) await sleep(wait);
    if (current.current?.id !== id || index <= current.current.index) return;
    current.current.index = index;
    shownAt.current = performance.now();
    setProc((p) => p && p.id === id ? {
      ...p, detail: null,
      steps: p.steps.map((s, i) => ({ ...s, state: i < index ? 'done' : i === index ? 'active' : 'pending' })),
    } : p);
  }, []);

  const detail = useCallback((id: number, text: string | null) => {
    setProc((p) => (p && p.id === id && p.detail !== text ? { ...p, detail: text } : p));
  }, []);

  const finish = useCallback(async (id: number, minMs = 550) => {
    const wait = minMs - (performance.now() - shownAt.current);
    if (wait > 0) await sleep(wait);
    if (current.current?.id !== id) return;
    setProc((p) => p && p.id === id ? { ...p, detail: null, steps: p.steps.map((s) => ({ ...s, state: 'done' })) } : p);
    await sleep(700);
    if (current.current?.id !== id) return;
    current.current = null;
    setProc(null);
  }, []);

  const fail = useCallback((id: number, message: string) => {
    if (current.current?.id !== id) return;
    setProc((p) => p && p.id === id ? {
      ...p, failed: message, scan: false,
      steps: p.steps.map((s) => (s.state === 'active' ? { ...s, state: 'error' } : s)),
    } : p);
  }, []);

  const dismiss = useCallback(() => { current.current = null; setProc(null); }, []);

  /** True while `id` is still the process on screen (for timers that narrate a long wait). */
  const isCurrent = useCallback((id: number) => current.current?.id === id, []);

  return { proc, start, advance, detail, finish, fail, dismiss, isCurrent };
}

export type Stepper = ReturnType<typeof useStepper>;

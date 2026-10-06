import type { ReactNode } from 'react';
import type { Layout, Mode, Step, Tool } from '../Visualizer';
import type { useSegmentation } from '../lib/useSegmentation';
import type { Slab } from '../slabs';
import type { Enhanced } from '../lib/enhance';
import { PhotoPicker } from './PhotoPicker';

interface Props {
  step: Step;
  setStep: (s: Step) => void;
  photo: ImageData | null;
  hasMask: boolean;
  seg: ReturnType<typeof useSegmentation>;
  editCount: number;
  tool: Tool;
  setTool: (t: Tool) => void;
  mode: Mode;
  setMode: (m: Mode) => void;
  brushSize: number;
  setBrushSize: (v: number) => void;
  working: boolean;
  onOpenPhoto: (f: File) => void;
  onAuto: () => void;
  onUndo: () => void;
  onClear: () => void;
  onResetCorners: () => void;
  layout: Layout;
  setLayout: (fn: (l: Layout) => Layout) => void;
  widthM: number;
  slab: Slab;
  estimate: { areaM2: number; slabs: number };
  split: number | null;
  setSplit: (v: number | null) => void;
  onDownload: () => void;
  onSave: () => void;
  onQuote: () => void;
  saved: boolean;
  ai: {
    available: boolean;
    remaining: number | null; // null when signed out
    limit: number;
    result: Enhanced | null;
    busy: boolean;
    error: string | null;
    view: 'exact' | 'ai';
    setView: (v: 'exact' | 'ai') => void;
    run: () => void;
  };
}

function Section(props: {
  n: Step; title: string; summary?: string; open: boolean; enabled: boolean; onOpen: () => void; children: ReactNode;
}) {
  return (
    <section className={`step${props.open ? ' is-open' : ''}${props.enabled ? '' : ' is-disabled'}`}>
      <button type="button" className="step-head" onClick={props.onOpen} disabled={!props.enabled} aria-expanded={props.open}>
        <span className="step-n">{props.n}</span>
        <span className="step-title">{props.title}</span>
        {!props.open && props.summary && <span className="step-summary">{props.summary}</span>}
      </button>
      {props.open && <div className="step-body">{props.children}</div>}
    </section>
  );
}

const HINTS: Record<Tool, Record<Mode, string>> = {
  tap: {
    add: 'Tap bare wall to add it. A tap that lands on a plant or cable snaps to the wall beside it.',
    remove: 'Tap a TV, frame or switchboard to keep it uncovered.',
  },
  brush: {
    add: 'Paint over gaps the taps missed. Only bare wall is picked up, so you can brush right over leaves and cables.',
    remove: 'Paint over anything that should stay uncovered.',
  },
};

const finePointer = typeof window !== 'undefined' && window.matchMedia?.('(pointer: fine)').matches;

const fmt = (n: number, d = 2) => n.toLocaleString(undefined, { maximumFractionDigits: d });

export function Rail(p: Props) {
  const set = <K extends keyof Layout>(k: K, v: Layout[K]) => p.setLayout((l) => ({ ...l, [k]: v }));
  const busy = p.working || p.seg.phase !== 'idle' || !p.seg.ready;

  return (
    <aside className="rail">
      <Section n={1} title="Your photo" summary={p.photo ? `${p.photo.width} × ${p.photo.height}px` : undefined}
        open={p.step === 1} enabled onOpen={() => p.setStep(1)}>
        <p className="hint">Stand back so the whole wall is in frame, with the corners visible if you can.</p>
        <PhotoPicker onFile={p.onOpenPhoto} compact={!!p.photo} />
      </Section>

      <Section n={2} title={p.hasMask ? 'Adjust the wall' : 'Pick the wall'} summary={p.hasMask ? 'Found for you. Fix anything we missed' : undefined}
        open={p.step === 2} enabled={!!p.photo} onOpen={() => p.setStep(2)}>
        <button type="button" className="btn btn-find btn-wide" onClick={() => p.onAuto()} disabled={busy}>
          <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M3 7V4a1 1 0 0 1 1-1h3M13 3h3a1 1 0 0 1 1 1v3M17 13v3a1 1 0 0 1-1 1h-3M7 17H4a1 1 0 0 1-1-1v-3" /><path d="M7 10.5l2 2 4-5" /></svg>
          {p.hasMask ? 'Find the wall again' : 'Find the wall for me'}
        </button>

        <div className="or"><span>or mark it yourself</span></div>

        <div className="toolrow">
          <div className="seg seg-icons" role="radiogroup" aria-label="Tool">
            <button type="button" role="radio" aria-checked={p.tool === 'tap'} className="seg-opt" onClick={() => p.setTool('tap')}>
              <svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="3" /><circle cx="10" cy="10" r="7" /></svg>Tap
            </button>
            <button type="button" role="radio" aria-checked={p.tool === 'brush'} className="seg-opt" onClick={() => p.setTool('brush')}>
              <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M13.5 3.5l3 3-7.5 7.5-3-3z" /><path d="M6 11l-1.5 1.5c-1 1-1 3-2 4 1.5 0 3.5-.2 4.5-1.2L8.5 14" /></svg>Brush
            </button>
          </div>
          <div className="seg" role="radiogroup" aria-label="Mode">
            <button type="button" role="radio" aria-checked={p.mode === 'add'} className="seg-opt seg-add" onClick={() => p.setMode('add')}>Add</button>
            <button type="button" role="radio" aria-checked={p.mode === 'remove'} className="seg-opt seg-remove" onClick={() => p.setMode('remove')}>Remove</button>
          </div>
        </div>

        <p className="hint">{HINTS[p.tool][p.mode]}</p>

        {p.tool === 'brush' && (
          <label className="slider">
            <span>Brush size</span>
            <input type="range" min={0.006} max={0.06} step={0.002} value={p.brushSize} onChange={(e) => p.setBrushSize(Number(e.target.value))} />
          </label>
        )}

        <div className="row row-between">
          <div className="row">
            <button type="button" className="btn btn-quiet" onClick={p.onUndo} disabled={!p.editCount || busy}>Undo</button>
            <button type="button" className="btn btn-quiet" onClick={p.onClear} disabled={!p.editCount || busy}>Start over</button>
          </div>
          {finePointer && <span className="kbd-hint">Right-click does the opposite</span>}
        </div>
        <button type="button" className="btn btn-primary btn-wide" disabled={!p.hasMask || p.working} onClick={() => p.setStep(3)}>Next: fit to the wall</button>
      </Section>
      <Section n={3} title="Adjust the fit" summary={p.hasMask ? `${fmt(p.widthM)} × ${fmt(p.layout.heightM)} m` : undefined}
        open={p.step === 3} enabled={p.hasMask} onOpen={() => p.setStep(3)}>
        <p className="hint">Drag the four corners onto the wall's real corners so the slabs follow its angle. Then give its height, which sets the scale.</p>
        <div className="fields">
          <label className="field">
            <span>Height</span>
            <span className="unit-input">
              <input type="number" min={1} max={12} step={0.05} value={p.layout.heightM}
                onChange={(e) => set('heightM', Math.max(0.5, Number(e.target.value) || 0))} />
              <span>m</span>
            </span>
          </label>
          <label className="field">
            <span>Width{p.layout.widthM == null && <em> estimated</em>}</span>
            <span className="unit-input">
              <input type="number" min={0.5} max={30} step={0.05} value={p.widthM}
                onChange={(e) => set('widthM', Math.max(0.5, Number(e.target.value) || 0))} />
              <span>m</span>
            </span>
          </label>
        </div>
        <div className="row">
          <button type="button" className="btn btn-quiet" onClick={p.onResetCorners}>Reset corners</button>
          {p.layout.widthM != null && (
            <button type="button" className="btn btn-quiet" onClick={() => set('widthM', null)}>Estimate width</button>
          )}
        </div>
        <button type="button" className="btn btn-primary btn-wide" onClick={() => p.setStep(4)}>Next: choose the marble</button>
      </Section>

      <Section n={4} title="Choose the marble" summary={p.hasMask ? p.slab.name : undefined}
        open={p.step === 4} enabled={p.hasMask} onOpen={() => p.setStep(4)}>
        <div className="tag">
          <h2 className="tag-name">{p.slab.name}</h2>
          <dl className="tag-spec">
            <dt>Quarry</dt><dd>{p.slab.origin}</dd>
            <dt>Finish</dt><dd>{p.slab.finish}</dd>
            <dt>Slab</dt><dd>{p.slab.sizeMm[0]} × {p.slab.sizeMm[1]} mm</dd>
          </dl>
        </div>

        <div className="seg" role="radiogroup" aria-label="Slab direction">
          <button type="button" role="radio" aria-checked={p.layout.vertical} className="seg-opt" onClick={() => set('vertical', true)}>Standing</button>
          <button type="button" role="radio" aria-checked={!p.layout.vertical} className="seg-opt" onClick={() => set('vertical', false)}>Lying</button>
        </div>
        <label className="check">
          <input type="checkbox" checked={p.layout.bookmatch} onChange={(e) => set('bookmatch', e.target.checked)} />
          <span>Bookmatch neighbouring slabs</span>
        </label>
        <label className="slider">
          <span>Joint <output>{p.layout.jointMm} mm</output></span>
          <input type="range" min={0} max={8} step={1} value={p.layout.jointMm} onChange={(e) => set('jointMm', Number(e.target.value))} />
        </label>
        <label className="slider">
          <span>Room light on the stone <output>{Math.round(p.layout.light * 100)}%</output></span>
          <input type="range" min={0} max={1} step={0.05} value={p.layout.light} onChange={(e) => set('light', Number(e.target.value))} />
        </label>

        <div className="estimate">
          <div><span className="estimate-n">{fmt(p.estimate.areaM2, 1)} m²</span><span className="estimate-l">wall area</span></div>
          <div><span className="estimate-n">{p.estimate.slabs}</span><span className="estimate-l">{p.estimate.slabs === 1 ? 'slab' : 'slabs'} at this layout</span></div>
        </div>

        {p.ai.available && (
          <div className="ai">
            <p className="ai-title">Photoreal finish</p>
            {p.ai.result ? (
              <>
                <div className="seg" role="radiogroup" aria-label="Show">
                  <button type="button" role="radio" aria-checked={p.ai.view === 'exact'} className="seg-opt" onClick={() => p.ai.setView('exact')}>Exact slab</button>
                  <button type="button" role="radio" aria-checked={p.ai.view === 'ai'} className="seg-opt" onClick={() => p.ai.setView('ai')}>AI finish</button>
                </div>
                <p className="ai-note">
                  {p.ai.view === 'ai'
                    ? 'An impression of the finished room, with reflections and shadows added by AI. Veining may differ slightly; Exact slab shows the true pattern.'
                    : 'The true veining and layout of this slab, as it would be cut and fitted.'}
                </p>
                {p.ai.result.mode === 'full' && p.ai.view === 'ai' && (
                  <p className="ai-note">The AI shifted parts of the room, so its whole picture is shown rather than just the wall.</p>
                )}
              </>
            ) : (
              <>
                <p className="ai-note">Adds polished-stone reflections and shadows, and cleans up the edges around furniture and plants. Takes about 25 seconds. Your design is sent to Google's Gemini to create it.</p>
                <button type="button" className="btn btn-ai btn-wide" onClick={p.ai.run} disabled={p.ai.busy || p.ai.remaining === 0}>
                  {p.ai.busy ? 'Adding the finish…' : p.ai.remaining === 0 ? 'No AI finishes left today' : 'Enhance with AI'}
                </button>
                <p className="ai-quota">
                  {p.ai.remaining == null
                    ? `Free with an account, ${p.ai.limit} a day.`
                    : `${p.ai.remaining} of ${p.ai.limit} left today.`}
                </p>
              </>
            )}
            {p.ai.error && <p className="ai-error" role="alert">{p.ai.error}</p>}
          </div>
        )}

        <div className="row">
          <button type="button" className="btn" onClick={() => p.setSplit(p.split == null ? 0.5 : null)}>
            {p.split == null ? 'Compare with today' : 'Hide comparison'}
          </button>
          <button type="button" className="btn" onClick={p.onDownload}>Download</button>
          <button type="button" className="btn" onClick={p.onSave} disabled={p.saved}>{p.saved ? 'Saved' : 'Save design'}</button>
        </div>
        <button type="button" className="btn btn-primary btn-wide btn-quote" onClick={p.onQuote}>Get a quote for this wall</button>
      </Section>

      {p.seg.device && (
        <p className="engine">Wall finder running on {p.seg.device === 'webgpu' ? 'your graphics card' : 'your processor'}. Photos stay on this device.</p>
      )}
    </aside>
  );
}

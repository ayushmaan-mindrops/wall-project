import './styles.css';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { type Quad, estimateAspect, quadFromMask } from './lib/homography';
import {
  aiRegion, featherMask, iou, keepMainRegions, keepWallPixels, lightFixtures, loadPhoto, mainWall, rasterStroke, refineMask,
  shadingMap, snapToWall, wallColor, wallShare,
} from './lib/imageOps';
import { type RenderParams, WallRenderer } from './lib/renderer';
import type { TapPoint } from './lib/segTypes';
import { useSegmentation } from './lib/useSegmentation';
import { useStepper } from './lib/useStepper';
import { GLOSS, SLABS, type Slab, slabById } from './slabs';
import { SlabRack } from './components/SlabRack';
import { Stage } from './components/Stage';
import { Rail } from './components/Rail';
import { type Enhanced, type EnhanceStatus, compositeEnhancement, enhanceStatus, requestEnhancement } from './lib/enhance';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from './site/auth';
import { useQuote } from './site/quote';
import { api } from './site/api';

export type Step = 1 | 2 | 3 | 4;
export type Tool = 'tap' | 'brush';
export type Mode = 'add' | 'remove';

export interface Layout {
  heightM: number;
  widthM: number | null; // null = estimate from the outline
  vertical: boolean;
  bookmatch: boolean;
  jointMm: number;
  light: number;
}

/** One change to the wall selection. The selection is these, applied in order. */
type Edit =
  | { kind: 'base'; mask: Uint8Array } // from "Find the wall for me"
  | { kind: 'tap'; point: TapPoint; mask: Uint8Array }
  | { kind: 'brush'; mode: Mode; mask: Uint8Array };

const slabImages = new Map<string, Promise<HTMLImageElement>>();
function loadSlab(slab: Slab) {
  let p = slabImages.get(slab.id);
  if (!p) {
    p = new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error(`Could not load ${slab.image}`));
      img.src = slab.image;
    });
    slabImages.set(slab.id, p);
  }
  return p;
}

interface AutoRun { id: number; base: number; landOnMarble?: boolean }
const AUTO_STEPS = ['Finding the main wall', 'Tracing its edges', 'Fitting around furniture and fixtures', 'Laying the marble'];

const nextFrame = () => new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));
const area = (m: Uint8Array) => { let a = 0; for (let i = 0; i < m.length; i += 4) a += m[i]; return a * 4; };

export default function Visualizer() {
  const seg = useSegmentation();
  const auth = useAuth();
  const quote = useQuote();
  const [params0] = useSearchParams();
  const stepper = useStepper();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const renderer = useRef<WallRenderer | null>(null);
  const [glError, setGlError] = useState<string | null>(null);

  const [photo, setPhoto] = useState<ImageData | null>(null);
  const [mask, setMask] = useState<Uint8Array | null>(null);
  const [edits, setEdits] = useState<Edit[]>([]);
  const [tool, setTool] = useState<Tool>('tap');
  const [mode, setMode] = useState<Mode>('add');
  const [brushSize, setBrushSize] = useState(0.02); // radius, as a share of the photo's long side
  const [quad, setQuad] = useState<Quad | null>(null);
  const quadTouched = useRef(false);
  const [step, setStep] = useState<Step>(1);
  const [slab, setSlab] = useState<Slab>(() => slabById(params0.get('slab')) ?? SLABS[0]);
  const [slabReady, setSlabReady] = useState(false);
  const [split, setSplit] = useState<number | null>(null);
  const [layout, setLayout] = useState<Layout>({
    heightM: 2.7, widthM: null, vertical: true, bookmatch: true, jointMm: 2, light: 0.7,
  });
  const softMask = useRef<Uint8Array | null>(null);
  const working = !!stepper.proc && !stepper.proc.failed;

  useLayoutEffect(() => {
    if (!canvasRef.current || renderer.current) return;
    try {
      renderer.current = new WallRenderer(canvasRef.current);
    } catch (e) {
      setGlError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  // After a photo loads, the wall finder gets ready quietly (model download on a
  // first visit, plus the one-off encoding that makes taps instant). Nothing is
  // detected until the visitor chooses: one click to have it all done, or mark
  // the wall themselves.
  const [offer, setOffer] = useState(false);
  const encodedAtOpen = useRef(0);
  const prep = useRef<{ id: number } | null>(null);
  const [prepRun, setPrepRun] = useState(0);
  const autoRef = useRef<((run?: AutoRun) => Promise<void>) | null>(null);
  const openPhoto = useCallback(async (file: File) => {
    const img = await loadPhoto(file);
    renderer.current?.setPhoto(img);
    renderer.current?.setMask(new Uint8Array(img.width * img.height), img.width, img.height);
    encodedAtOpen.current = seg.encoded;
    seg.setImage(img);
    setPhoto(img);
    setMask(null);
    setEdits([]);
    setQuad(null);
    setSplit(null);
    quadTouched.current = false;
    prep.current = null;
    setStep(2);
    setOffer(true);
  }, [seg.setImage, seg.encoded]);

  /** One click: find the wall, fit it and lay the marble, then land on choosing a slab. */
  const doItForMe = useCallback(() => {
    setOffer(false);
    const id = stepper.start('Setting up your wall', ['Loading the wall finder', 'Studying the room', ...AUTO_STEPS], { scan: true, eta: 'About 15 seconds' });
    prep.current = { id };
    setPrepRun((n) => n + 1);
  }, [stepper.start]);

  const markItMyself = useCallback(() => { setOffer(false); setTool('tap'); setMode('add'); }, []);

  useEffect(() => {
    const p = prep.current;
    if (!p) return;
    if (seg.ready) stepper.advance(p.id, 1);
    else stepper.detail(p.id, `${Math.round((seg.modelProgress.sam ?? 0) * 100)}%, only the first time`);
    if (seg.encoded > encodedAtOpen.current) {
      prep.current = null;
      autoRef.current?.({ id: p.id, base: 2, landOnMarble: true });
    }
  }, [prepRun, seg.ready, seg.encoded, seg.modelProgress, stepper.advance, stepper.detail]);

  useEffect(() => {
    const p = prep.current;
    if (p && seg.error) { prep.current = null; stepper.fail(p.id, `${seg.error} Reload the page to try again, or tap the wall yourself.`); }
  }, [seg.error, stepper.fail]);

  useEffect(() => {
    const p = prep.current;
    if (!p) return;
    const t = setTimeout(() => {
      if (prep.current?.id !== p.id) return;
      prep.current = null;
      stepper.fail(p.id, 'The wall finder is taking too long to start. Check your connection and reload the page.');
    }, 180_000);
    return () => clearTimeout(t);
  }, [prepRun, stepper.fail]);

  const fixtures = useMemo(() => (photo ? lightFixtures(photo) : null), [photo]);

  const compose = useCallback((list: Edit[]) => {
    const n = photo!.width * photo!.height;
    const out = new Uint8Array(n), removed = new Uint8Array(n);
    for (const e of list) {
      const add = e.kind === 'base' || (e.kind === 'tap' ? e.point.label === 1 : e.mode === 'add');
      const m = e.mask;
      if (add) { for (let i = 0; i < n; i++) if (m[i]) { out[i] = 1; removed[i] = 0; } }
      else for (let i = 0; i < n; i++) if (m[i]) { out[i] = 0; removed[i] = 1; }
    }
    return { out, removed };
  }, [photo]);

  const applyEdits = useCallback((list: Edit[]) => {
    if (!photo) return;
    setEdits(list);
    const { width: w, height: h } = photo;
    const { out, removed } = compose(list);
    const blocked = removed;
    if (fixtures) for (let i = 0; i < blocked.length; i++) blocked[i] |= fixtures[i];
    const { mask: m, alpha } = refineMask(photo, out, blocked);
    softMask.current = alpha;
    let any = false;
    for (let i = 0; i < m.length; i += 7) if (m[i]) { any = true; break; }
    setMask(any ? m : null);
    renderer.current?.setMask(alpha, w, h);
    const shade = shadingMap(photo, m, fixtures);
    renderer.current?.setShade(shade);
    if (import.meta.env.DEV) Object.assign(window, { __shade: shade, __mask: m });
    if (any && !quadTouched.current) setQuad(quadFromMask(m, w, h));
  }, [photo, fixtures, compose]);

  const tap = useCallback(async (x: number, y: number, tapMode: Mode) => {
    if (!photo) return;
    const { width: W, height: H } = photo;
    const model = mask ? wallColor(photo, mask) : null;
    let point: TapPoint = { x, y, label: tapMode === 'add' ? 1 : 0 };
    // Adding, but the finger landed on a leaf, a cable or a bulb next to bare
    // wall: move the tap onto that wall, which is almost always what was meant.
    let onWall = false;
    if (point.label && model && mask) {
      const at = (px: number, py: number) => Math.round(py) * W + Math.round(px);
      onWall = model.test(at(x, y));
      if (!onWall) {
        const s = snapToWall(x, y, Math.max(W, H) / 45, W, H, mask, model);
        if (s) { point = { ...point, x: s[0], y: s[1] }; onWall = true; }
      }
    }    const pending = [...edits, { kind: 'tap', point, mask: new Uint8Array(0) } as Edit];
    setEdits(pending);
    try {
      const c = await seg.decode(point);
      let pick = 0;
      let chosen: Uint8Array;
      if (point.label) {
        if (model && mask) {
          // Rank SAM's readings by confidence and by how much bare wall they add.
          const rank = c.masks.map((m, k) => c.scores[k] * (0.25 + wallShare(m, mask, model)));
          pick = rank.indexOf(Math.max(...rank));
          // Tapped bare wall: add only bare wall, never the plant or bulb SAM lumped in.
          // Tapped a different surface on purpose (another wall colour): add it as is.
          chosen = onWall ? keepWallPixels(c.masks[pick], model, 0) ?? c.masks[pick] : c.masks[pick];
        } else {
          for (let k = 1; k < c.scores.length; k++) if (c.scores[k] > c.scores[pick]) pick = k;
          chosen = c.masks[pick];
        }
      } else {
        // Removing: the object under the tap, not the whole wall it sits on.
        const limit = mask ? area(mask) * 0.4 : Infinity;
        const areas = c.masks.map(area);
        const fits = c.scores.map((_, k) => k).filter((k) => areas[k] > 0 && areas[k] < limit);
        pick = fits.length ? fits.reduce((a, b) => (c.scores[b] > c.scores[a] ? b : a)) : areas.indexOf(Math.min(...areas));
        chosen = c.masks[pick];
      }
      applyEdits([...edits, { kind: 'tap', point, mask: chosen }]);
    } catch {
      setEdits(edits); // error is surfaced by the hook
    }
  }, [photo, mask, edits, seg.decode, applyEdits]);

  const brush = useCallback((points: [number, number][], radius: number, brushMode: Mode) => {
    if (!photo || !points.length) return;
    let stroke = rasterStroke(points, radius, photo.width, photo.height);
    // Adding by brush only takes pixels that look like bare wall, so scrubbing
    // over a plant fills the gaps between its leaves without cladding the leaves.
    if (brushMode === 'add' && mask) {
      const model = wallColor(photo, mask);
      if (model) stroke = keepWallPixels(stroke, model) ?? stroke;
    }
    applyEdits([...edits, { kind: 'brush', mode: brushMode, mask: stroke }]);
  }, [photo, mask, edits, applyEdits]);

  const undo = useCallback(() => {
    if (!edits.length) return;
    applyEdits(edits.slice(0, -1));
  }, [edits, applyEdits]);

  const clearWall = useCallback(() => {
    quadTouched.current = false;
    setQuad(null);
    applyEdits([]);
  }, [applyEdits]);

  const autoRun = useRef<number | null>(null);
  const autoDetect = useCallback(async (run?: AutoRun) => {
    if (!photo) return;
    const base = run?.base ?? 0;
    const id = run?.id ?? stepper.start('Finding your wall', AUTO_STEPS, { scan: true, eta: 'About 10 seconds' });
    await stepper.advance(id, base);    autoRun.current = id;
    try {
      const r = await seg.auto();
      autoRun.current = null;
      const main = mainWall(r.mask, photo.width, photo.height);
      if (!main) {
        stepper.fail(id, 'We couldn\'t find a wall on our own in this photo. Tap the wall you want to start.');
        return;
      }
      await stepper.advance(id, base + 1);
      const c = await seg.decode({ x: main.point[0], y: main.point[1], label: 1 });
      // SegFormer's wall region joins walls at the corners, so the reading that
      // matches it best is often every wall at once. Among readings that overlap
      // it plausibly, trust SAM's own confidence: usually the single wall plane.
      const overlaps = c.masks.map((m) => iou(m, main.region));
      let pick = overlaps.indexOf(Math.max(...overlaps));
      c.masks.forEach((_, k) => { if (overlaps[k] > 0.3 && c.scores[k] > c.scores[pick]) pick = k; });
      await stepper.advance(id, base + 2);
      await nextFrame();
      quadTouched.current = false;
      applyEdits([{ kind: 'base', mask: keepMainRegions(c.masks[pick], photo.width, photo.height) }]);
      await stepper.advance(id, base + 3);
      if (run?.landOnMarble) setStep(4);
      await stepper.finish(id);
    } catch (e) {
      autoRun.current = null;
      stepper.fail(id, e instanceof Error ? e.message : String(e));
    }
  }, [photo, seg.auto, seg.decode, stepper, applyEdits]);
  autoRef.current = autoDetect;

  useEffect(() => {
    const id = autoRun.current;
    const p = seg.modelProgress.wall;
    if (id != null && p != null && p < 1) stepper.detail(id, `Downloading the wall model (${Math.round(p * 100)}%)`);
  }, [seg.modelProgress, stepper.detail]);

  // Ctrl/Cmd+Z undoes the last selection change while picking the wall.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (step === 2 && (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !(e.target instanceof HTMLInputElement)) {
        e.preventDefault();
        undo();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [step, undo]);

  const points = useMemo(() => edits.flatMap((e) => (e.kind === 'tap' ? [e.point] : [])), [edits]);
  const moveCorner = useCallback((i: number, x: number, y: number) => {
    quadTouched.current = true;
    setQuad((q) => {
      if (!q) return q;
      const n = q.map((p) => [...p]) as Quad;
      n[i] = [x, y];
      return n;
    });
  }, []);

  const resetCorners = useCallback(() => {
    if (!mask || !photo) return;
    quadTouched.current = false;
    setQuad(quadFromMask(mask, photo.width, photo.height));
  }, [mask, photo]);

  useEffect(() => {
    let live = true;
    setSlabReady(false);
    loadSlab(slab).then((img) => {
      if (!live) return;
      renderer.current?.setSlab(img);
      setSlabReady(true);
    });
    return () => { live = false; };
  }, [slab]);

  // Once a photo is in, quietly fetch the other slabs so switching is instant.
  useEffect(() => {
    if (!photo) return;
    const t = setTimeout(() => SLABS.forEach(loadSlab), 1500);
    return () => clearTimeout(t);
  }, [photo]);

  const widthM = useMemo(() => {
    if (layout.widthM != null) return layout.widthM;
    if (!quad) return layout.heightM * 1.5;
    return Math.round(layout.heightM * estimateAspect(quad) * 100) / 100;
  }, [layout.widthM, layout.heightM, quad]);

  const params: RenderParams | null = useMemo(() => {
    if (!quad) return null;
    return {
      quad,
      wallM: [widthM, layout.heightM],
      slabM: [slab.sizeMm[0] / 1000, slab.sizeMm[1] / 1000],
      vertical: layout.vertical,
      bookmatch: layout.bookmatch,
      jointMm: layout.jointMm,
      light: layout.light,
      gloss: GLOSS[slab.finish],
      tint: step === 2,
      split: step >= 3 ? split ?? 1 : 1,
    };
  }, [quad, widthM, layout, slab, step, split]);

  useEffect(() => {
    const r = renderer.current;
    if (!r || !photo) return;
    const id = requestAnimationFrame(() => {
      if (params && (slabReady || params.tint)) r.render(params);
      else r.render({
        quad: [[0, 0], [1, 0], [1, 1], [0, 1]], wallM: [1, 1], slabM: [1, 1], vertical: false,
        bookmatch: false, jointMm: 0, light: 0, gloss: 0, tint: true, split: 1,
      });
    });
    return () => cancelAnimationFrame(id);
  }, [params, photo, slabReady, mask]);

  // AI finish: a photoreal pass over the exact render. Any change to the
  // design makes it stale, so it's dropped and the exact render shows again.
  const [aiStatus, setAiStatus] = useState<EnhanceStatus>({ available: false, signedIn: false, limit: 0, remaining: 0 });
  const [ai, setAi] = useState<Enhanced | null>(null);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [view, setView] = useState<'exact' | 'ai'>('exact');
  useEffect(() => { enhanceStatus().then(setAiStatus); }, [auth.user]);
  useEffect(() => {
    setAi((prev) => { if (prev) URL.revokeObjectURL(prev.url); return null; });
    setView('exact');
    setAiError(null);
  }, [quad, widthM, layout, slab, mask, photo]);

  const runEnhance = useCallback(async () => {
    const r = renderer.current;
    if (!r || !params || !photo || !mask) return;
    const who = await auth.requireUser(`Sign in to add the AI finish. Each account gets ${aiStatus.limit || 3} a day.`);
    if (!who) return;
    setAiBusy(true);
    setAiError(null);
    const id = stepper.start(`Finishing ${slab.name} in your room`, [
      'Preparing your design',
      'Sending it to the AI studio',
      'Adding polish and reflections',
      'Deepening shadows where things meet the wall',
      'Matching your room\'s light',
      'Fitting it back onto your wall',
    ], { scan: true, eta: 'About 25 seconds' });
    // The model works in one opaque call; narrate its stages on a typical timeline.
    const timers = [
      setTimeout(() => stepper.advance(id, 2, 0), 3500),
      setTimeout(() => stepper.advance(id, 3, 0), 10000),
      setTimeout(() => stepper.advance(id, 4, 0), 17000),
    ];
    try {
      r.render({ ...params, tint: false, split: 1 });
      const request = requestEnhancement({ render: r.canvas, photo, slabName: slab.name, finish: slab.finish });
      r.render(params);
      await stepper.advance(id, 1);
      const image = await request;
      if (image.remaining != null) setAiStatus((s) => ({ ...s, signedIn: true, remaining: image.remaining! }));
      timers.forEach(clearTimeout);
      await stepper.advance(id, 5, 300);
      const soft = softMask.current ?? featherMask(mask, photo.width, photo.height, 2);
      const result = await compositeEnhancement(photo, aiRegion(photo, mask, soft), image);
      await stepper.finish(id);
      setAi(result);
      setView('ai');
    } catch (e) {
      timers.forEach(clearTimeout);
      const msg = e instanceof Error ? e.message : String(e);
      setAiError(msg);
      stepper.fail(id, msg);
    } finally {
      setAiBusy(false);
    }
  }, [params, photo, mask, slab, stepper, auth, aiStatus.limit]);
  const download = useCallback(() => {
    const r = renderer.current;
    if (view === 'ai' && ai) {
      const a = document.createElement('a');
      a.href = ai.url;
      a.download = `${slab.id}-wall-ai.jpg`;
      a.click();
      return;
    }
    if (!r || !params) return;
    r.render({ ...params, tint: false, split: 1 });
    r.canvas.toBlob((blob) => {
      if (!blob) return;
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `${slab.id}-wall.jpg`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
      r.render(params);
    }, 'image/jpeg', 0.92);
  }, [params, slab.id, view, ai]);

  const cellM = layout.vertical
    ? [slab.sizeMm[1] / 1000, slab.sizeMm[0] / 1000]
    : [slab.sizeMm[0] / 1000, slab.sizeMm[1] / 1000];
  const estimate = {
    areaM2: widthM * layout.heightM,
    slabs: Math.ceil(widthM / cellM[0] - 0.02) * Math.ceil(layout.heightM / cellM[1] - 0.02),
  };
  // The image of what's on screen: the AI finish if showing, else the exact render.
  const currentImage = useCallback(async () => {
    if (view === 'ai' && ai) {
      const blob = await (await fetch(ai.url)).blob();
      return await new Promise<string>((res) => { const fr = new FileReader(); fr.onload = () => res(fr.result as string); fr.readAsDataURL(blob); });
    }
    const r = renderer.current!;
    r.render({ ...params!, tint: false, split: 1 });
    const url = r.canvas.toDataURL('image/jpeg', 0.9);
    r.render(params!);
    return url;
  }, [view, ai, params]);

  const [savedId, setSavedId] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  useEffect(() => { setSavedId(null); }, [quad, widthM, layout, slab, mask, photo, view]);
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(null), 3500); return () => clearTimeout(t); }, [toast]);

  const saveDesign = useCallback(async (silent = false) => {
    if (!params || !mask) return null;
    if (savedId) return savedId;
    const who = await auth.requireUser('Sign in to save this design and come back to it anytime.');
    if (!who) return null;
    try {
      const { id } = await api<{ id: string }>('/api/designs', {
        slabId: slab.id, kind: view === 'ai' && ai ? 'ai' : 'exact', image: await currentImage(),
        areaM2: Math.round(estimate.areaM2 * 10) / 10, slabs: estimate.slabs,
      });
      setSavedId(id);
      if (!silent) setToast('Saved to Your designs');
      return id;
    } catch (e) {
      setToast(e instanceof Error ? e.message : 'Could not save the design.');
      return null;
    }
  }, [params, mask, savedId, auth, slab, view, ai, currentImage, estimate.areaM2, estimate.slabs]);

  const requestQuote = useCallback(async () => {
    const id = await saveDesign(true);
    if (!id) return;
    quote({ slabId: slab.id, areaM2: Math.round(estimate.areaM2 * 10) / 10, slabs: estimate.slabs, designId: id, image: `/api/designs/${id}/image` });
  }, [saveDesign, quote, slab, estimate.areaM2, estimate.slabs]);


  return (
    <div className="app">

      <main className="stage-col">
        <Stage
          canvasRef={canvasRef}
          photo={photo}
          step={step}
          points={points}
          quad={quad}
          split={split}
          seg={seg}
          glError={glError}
          hasMask={!!mask}
          onOpenPhoto={openPhoto}
          onTap={tap}
          onBrush={brush}
          tool={tool}
          mode={mode}
          brushRadius={photo ? brushSize * Math.max(photo.width, photo.height) : 20}
          onMoveCorner={moveCorner}
          onSplit={setSplit}
          aiUrl={view === 'ai' && step >= 3 ? ai?.url ?? null : null}
          proc={stepper.proc}
          onDismissProc={stepper.dismiss}
          offer={offer && !mask ? { slabName: slab.name, onAuto: doItForMe, onManual: markItMyself } : null}
        />
        <SlabRack slabs={SLABS} selected={slab} onSelect={(s) => { setSlab(s); if (mask) setStep(4); }} />
      </main>

      <Rail
        step={step}
        setStep={setStep}
        photo={photo}
        hasMask={!!mask}
        seg={seg}
        editCount={edits.length}
        tool={tool}
        setTool={setTool}
        mode={mode}
        setMode={setMode}
        brushSize={brushSize}
        setBrushSize={setBrushSize}
        working={working}
        onOpenPhoto={openPhoto}
        onAuto={autoDetect}
        onUndo={undo}
        onClear={clearWall}
        onResetCorners={resetCorners}
        layout={layout}
        setLayout={setLayout}
        widthM={widthM}
        slab={slab}
        estimate={estimate}
        split={split}
        setSplit={setSplit}
        onDownload={download}
        ai={{ available: aiStatus.available, remaining: aiStatus.signedIn ? aiStatus.remaining : null, limit: aiStatus.limit, result: ai, busy: aiBusy, error: aiError, view, setView, run: runEnhance }}
        onSave={() => { saveDesign(); }}
        onQuote={requestQuote}
        saved={savedId != null}
      />
      {toast && <div className="toast" role="status">{toast}{toast.startsWith('Saved') && <a href="/designs">View</a>}</div>}
    </div>
  );
}

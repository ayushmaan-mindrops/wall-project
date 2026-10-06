import { type RefObject, useEffect, useRef, useState } from 'react';
import type { Mode, Step, Tool } from '../App';
import type { Quad } from '../lib/homography';
import type { TapPoint } from '../lib/segTypes';
import type { useSegmentation } from '../lib/useSegmentation';
import type { Process } from '../lib/useStepper';
import { PhotoPicker } from './PhotoPicker';
import { ProcessCard } from './ProcessCard';

interface Props {
  canvasRef: RefObject<HTMLCanvasElement | null>;
  photo: ImageData | null;
  step: Step;
  points: TapPoint[];
  quad: Quad | null;
  split: number | null;
  seg: ReturnType<typeof useSegmentation>;
  glError: string | null;
  hasMask: boolean;
  tool: Tool;
  mode: Mode;
  brushRadius: number; // image px
  onOpenPhoto: (f: File) => void;
  onTap: (x: number, y: number, mode: Mode) => void;
  onBrush: (points: [number, number][], radius: number, mode: Mode) => void;
  onMoveCorner: (i: number, x: number, y: number) => void;
  onSplit: (v: number) => void;
  aiUrl: string | null;
  proc: Process | null;
  onDismissProc: () => void;
}

type Drag =
  | { kind: 'corner'; i: number }
  | { kind: 'split' }
  | { kind: 'brush'; mode: Mode; points: [number, number][] };

const opposite = (m: Mode): Mode => (m === 'add' ? 'remove' : 'add');

export function Stage(p: Props) {
  const areaRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ w: 0, h: 0 });
  const drag = useRef<Drag | null>(null);
  const [stroke, setStroke] = useState<{ mode: Mode; points: [number, number][] } | null>(null);
  const [hover, setHover] = useState<[number, number] | null>(null);

  const pw = p.photo?.width ?? 1, ph = p.photo?.height ?? 1;

  useEffect(() => {
    const el = areaRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => {
      const { width, height } = e.contentRect;
      const s = Math.min(width / pw, height / ph);
      setBox({ w: Math.floor(pw * s), h: Math.floor(ph * s) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [pw, ph]);

  const scale = box.w / pw || 1;
  const toImage = (e: { clientX: number; clientY: number }): [number, number] => {
    const r = frameRef.current!.getBoundingClientRect();
    return [((e.clientX - r.left) / r.width) * pw, ((e.clientY - r.top) / r.height) * ph];
  };

  const working = !!p.proc && !p.proc.failed;
  const decoding = p.seg.phase === 'decoding';
  const selecting = p.step === 2 && !!p.photo && !working;

  const onPointerDown = (e: React.PointerEvent) => {
    if (!p.photo) return;
    const t = e.target as Element;
    const corner = t.getAttribute('data-corner');
    // Right-click (or the pen's barrel button) does the opposite of the current mode.
    const actMode = e.button === 2 ? opposite(p.mode) : p.mode;
    if (corner != null) {
      drag.current = { kind: 'corner', i: Number(corner) };
    } else if (t.closest('[data-split]')) {
      drag.current = { kind: 'split' };
    } else if (selecting && p.tool === 'brush') {
      const pt = toImage(e);
      drag.current = { kind: 'brush', mode: actMode, points: [pt] };
      setStroke({ mode: actMode, points: [pt] });
    } else if (selecting) {
      const [x, y] = toImage(e);
      p.onTap(x, y, actMode);
      return;
    } else return;
    frameRef.current!.setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const pt = toImage(e);
    if (selecting && p.tool === 'brush') setHover(pt);
    const d = drag.current;
    if (!d) return;
    if (d.kind === 'corner') p.onMoveCorner(d.i, pt[0], pt[1]);
    else if (d.kind === 'split') p.onSplit(Math.min(1, Math.max(0, pt[0] / pw)));
    else {
      const last = d.points[d.points.length - 1];
      if (Math.hypot(pt[0] - last[0], pt[1] - last[1]) > p.brushRadius / 4) {
        d.points.push(pt);
        setStroke({ mode: d.mode, points: [...d.points] });
      }
    }
  };
  const onPointerUp = () => {
    const d = drag.current;
    drag.current = null;
    if (d?.kind === 'brush') {
      p.onBrush(d.points, p.brushRadius, d.mode);
      setStroke(null);
    }
  };

  const showSplit = p.split != null && p.step >= 3;
  let notice: string | null = null;
  if (selecting && !p.hasMask && p.points.length === 0) {
    notice = p.tool === 'tap' ? 'Tap the wall you want to clad, or let us find it for you.' : 'Paint over the wall you want to clad.';
  }

  const brushColor = (m: Mode) => (m === 'add' ? 'var(--brush-add)' : 'var(--brush-remove)');

  return (
    <div className="stage" ref={areaRef}>
      <div
        ref={frameRef}
        className={[
          'frame',
          selecting ? (p.tool === 'brush' ? 'is-brushing' : 'is-tappable') : '',
          working ? 'is-working' : '',
          decoding ? 'is-busy' : '',
        ].join(' ')}
        style={{ width: box.w, height: box.h, visibility: p.photo ? 'visible' : 'hidden' }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onPointerLeave={() => setHover(null)}
        onContextMenu={(e) => { if (p.step === 2) e.preventDefault(); }}
      >
        <canvas ref={p.canvasRef} className="canvas" />
        {p.aiUrl && (
          <img
            className="ai-layer"
            src={p.aiUrl}
            alt=""
            style={{ clipPath: `inset(0 ${(1 - (showSplit ? p.split! : 1)) * 100}% 0 0)` }}
          />
        )}
        <svg className="overlay" viewBox={`0 0 ${pw} ${ph}`} preserveAspectRatio="none">
          {p.step === 2 && p.points.map((pt, i) => (
            <g
              key={i}
              transform={`translate(${pt.x} ${pt.y})`}
              className={`pin ${pt.label ? 'pin-add' : 'pin-remove'}${decoding && i === p.points.length - 1 ? ' is-pending' : ''}`}
            >
              <circle className="pin-pulse" r={9 / scale} />
              <circle r={9 / scale} />
              <path d={pt.label ? `M${-4 / scale} 0H${4 / scale}M0 ${-4 / scale}V${4 / scale}` : `M${-4 / scale} 0H${4 / scale}`} strokeWidth={1.6 / scale} />
            </g>
          ))}
          {stroke && (
            <polyline
              className="stroke"
              points={stroke.points.map((q) => q.join(',')).join(' ')}
              stroke={brushColor(stroke.mode)}
              strokeWidth={p.brushRadius * 2}
            />
          )}
          {selecting && p.tool === 'brush' && hover && !stroke && (
            <circle className="brush-cursor" cx={hover[0]} cy={hover[1]} r={p.brushRadius} stroke={brushColor(p.mode)} strokeWidth={1.5 / scale} />
          )}
          {p.step === 3 && p.quad && (
            <>
              <polygon className="outline" points={p.quad.map((q) => q.join(',')).join(' ')} strokeWidth={1.5 / scale} />
              {p.quad.map((q, i) => (
                <circle key={i} className="corner" data-corner={i} cx={q[0]} cy={q[1]} r={11 / scale} strokeWidth={2 / scale} />
              ))}
            </>
          )}
          {showSplit && (
            <g data-split className="split">
              <line x1={p.split! * pw} x2={p.split! * pw} y1={0} y2={ph} strokeWidth={2 / scale} />
              <rect x={p.split! * pw - 16 / scale} y={ph / 2 - 22 / scale} width={32 / scale} height={44 / scale} rx={16 / scale} />
              <rect x={p.split! * pw - 40 / scale} y={0} width={80 / scale} height={ph} fill="transparent" />
            </g>
          )}
        </svg>
        {showSplit && (
          <>
            <span className="split-tag split-tag-left">Marble</span>
            <span className="split-tag split-tag-right">Today</span>
          </>
        )}
        {p.proc?.scan && !p.proc.failed && <div className="scan" aria-hidden="true" />}
      </div>

      {p.proc && <ProcessCard proc={p.proc} onDismiss={p.onDismissProc} />}
      {!p.proc && notice && <div className="notice" role="status">{notice}</div>}
      {!p.proc && p.seg.error && p.photo && <div className="notice notice-error" role="alert">{p.seg.error}</div>}
      {p.glError && <div className="notice notice-error" role="alert">{p.glError}</div>}

      {!p.photo && (
        <div className="empty">
          <h1 className="empty-title">Stand back, frame the whole wall, and take a photo.</h1>
          <p className="empty-body">Then pick a slab from the rack below. The marble is laid at true size, with the light from your room still falling on it.</p>
          <PhotoPicker onFile={p.onOpenPhoto} />
        </div>
      )}
    </div>
  );
}

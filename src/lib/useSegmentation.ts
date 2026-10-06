import { useCallback, useEffect, useRef, useState } from 'react';
import type { SegRequest, SegResponse, TapPoint } from './segTypes';

export interface MaskResult {
  mask: Uint8Array;
  w: number;
  h: number;
  score: number;
}

export interface Candidates {
  masks: Uint8Array[]; // each w*h, 0/1
  scores: number[];
  w: number;
  h: number;
}

export type SegPhase = 'loading' | 'idle' | 'encoding' | 'decoding' | 'auto';

/** Owns the segmentation worker and exposes a promise-based API to React. */
export function useSegmentation() {
  const worker = useRef<Worker | null>(null);
  const pending = useRef(new Map<number, { resolve: (r: any) => void; reject: (e: Error) => void }>());
  const files = useRef(new Map<string, { loaded: number; total: number }>());
  const nextId = useRef(1);

  const [ready, setReady] = useState(false);
  const [device, setDevice] = useState<'webgpu' | 'wasm' | null>(null);
  const [phase, setPhase] = useState<SegPhase>('loading');
  const [download, setDownload] = useState(0); // 0..1, all models
  const [modelProgress, setModelProgress] = useState<Record<string, number>>({}); // per model, 0..1
  const [encoded, setEncoded] = useState(0); // bumps each time a photo is ready for taps
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const w = new Worker(new URL('../workers/segmentation.worker.ts', import.meta.url), { type: 'module' });
    worker.current = w;
    w.onmessage = (e: MessageEvent<SegResponse>) => {
      const msg = e.data;
      switch (msg.type) {
        case 'progress': {
          files.current.set(`${msg.model}/${msg.file}`, { loaded: msg.loaded, total: msg.total });
          let loaded = 0, total = 0;
          for (const f of files.current.values()) { loaded += f.loaded; total += f.total; }
          setDownload(total ? loaded / total : 0);
          const per: Record<string, [number, number]> = {};
          for (const [key, f] of files.current) {
            const m = key.split('/')[0];
            per[m] = [(per[m]?.[0] ?? 0) + f.loaded, (per[m]?.[1] ?? 0) + f.total];
          }
          setModelProgress(Object.fromEntries(Object.entries(per).map(([m, [l, t]]) => [m, t ? l / t : 0])));
          break;
        }
        case 'ready':
          setReady(true);
          setDevice(msg.device);
          setPhase((p) => (p === 'loading' ? 'idle' : p));
          break;
        case 'status':
          setPhase(msg.status === 'encoded' ? 'idle' : msg.status);
          if (msg.status === 'encoded') setEncoded((n) => n + 1);
          break;
        case 'mask': {
          const p = pending.current.get(msg.id);
          pending.current.delete(msg.id);
          setPhase('idle');
          p?.resolve({ mask: msg.mask, w: msg.w, h: msg.h, score: msg.score });
          break;
        }
        case 'candidates': {
          const p = pending.current.get(msg.id);
          pending.current.delete(msg.id);
          setPhase('idle');
          const n = msg.w * msg.h;
          const masks = msg.scores.map((_, k) => msg.masks.subarray(k * n, (k + 1) * n));
          p?.resolve({ masks, scores: msg.scores, w: msg.w, h: msg.h } satisfies Candidates);
          break;
        }
        case 'error':
          setError(msg.message);
          setPhase('idle');
          for (const p of pending.current.values()) p.reject(new Error(msg.message));
          pending.current.clear();
          break;
      }
    };
    const warm: SegRequest = { type: 'warmup' };
    w.postMessage(warm);
    return () => w.terminate();
  }, []);

  const send = (msg: SegRequest, transfer: Transferable[] = []) => worker.current?.postMessage(msg, transfer);

  const setImage = useCallback((img: ImageData) => {
    setError(null);
    const pixels = img.data.slice().buffer;
    send({ type: 'setImage', pixels, width: img.width, height: img.height }, [pixels]);
  }, []);

  const request = <T,>(make: (id: number) => SegRequest, nextPhase: SegPhase) =>
    new Promise<T>((resolve, reject) => {
      const id = nextId.current++;
      pending.current.set(id, { resolve, reject });
      setError(null);
      setPhase(nextPhase);
      send(make(id));
    });

  const decode = useCallback((point: TapPoint) => request<Candidates>((id) => ({ type: 'decode', id, point }), 'decoding'), []);
  const auto = useCallback(() => request<MaskResult>((id) => ({ type: 'auto', id }), 'auto'), []);

  return { ready, device, phase, download, modelProgress, encoded, error, setImage, decode, auto };
}

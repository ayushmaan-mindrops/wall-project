/// <reference lib="webworker" />
import {
  AutoProcessor,
  RawImage,
  Sam2Model,
  Sam2Processor,
  Tensor,
  env,
  pipeline,
  type ImageSegmentationPipeline,
} from '@huggingface/transformers';
import type { SegRequest, SegResponse, TapPoint } from '../lib/segTypes';

const SAM_ID = 'onnx-community/sam2.1-hiera-tiny-ONNX';
const WALL_ID = 'Xenova/segformer-b2-finetuned-ade-512-512';

env.allowLocalModels = false;
// ONNX Runtime's WASM runtime is self-hosted (see vite.config.ts), not loaded from a CDN.
if (env.backends.onnx?.wasm) env.backends.onnx.wasm.wasmPaths = '/ort/';

const post = (msg: SegResponse, transfer: Transferable[] = []) => self.postMessage(msg, transfer);

// Surface anything that escapes a request handler (for example inside ONNX Runtime start-up).
self.addEventListener('unhandledrejection', (e) => {
  post({ type: 'error', message: e.reason instanceof Error ? e.reason.message : String(e.reason), request: 'warmup' });
});

let device: 'webgpu' | 'wasm' = 'wasm';
let sam: { model: Sam2Model; processor: Sam2Processor } | null = null;
let wallSeg: ImageSegmentationPipeline | null = null;

let image: RawImage | null = null;
let embedded: { embeddings: Record<string, Tensor>; original: [number, number]; reshaped: [number, number] } | null = null;

async function pickDevice() {
  const gpu = (navigator as Navigator & { gpu?: { requestAdapter(): Promise<{ features: Set<string> } | null> } }).gpu;
  if (!gpu) return { device: 'wasm' as const, fp16: false };
  try {
    const adapter = await gpu.requestAdapter();
    if (!adapter) return { device: 'wasm' as const, fp16: false };
    return { device: 'webgpu' as const, fp16: adapter.features.has('shader-f16') };
  } catch {
    return { device: 'wasm' as const, fp16: false };
  }
}

function progress(model: string) {
  return (p: { status: string; file?: string; loaded?: number; total?: number }) => {
    if (p.status === 'progress' && p.file) {
      post({ type: 'progress', model, file: p.file, loaded: p.loaded ?? 0, total: p.total ?? 0 });
    }
  };
}

async function loadSam() {
  if (sam) return sam;
  const pick = await pickDevice();
  device = pick.device;
  const dtype = device === 'webgpu' ? (pick.fp16 ? 'fp16' : 'fp32') : 'q8';
  const [model, processor] = await Promise.all([
    Sam2Model.from_pretrained(SAM_ID, { device, dtype, progress_callback: progress('sam') }),
    AutoProcessor.from_pretrained(SAM_ID, { progress_callback: progress('sam') }),
  ]);
  sam = { model: model as Sam2Model, processor: processor as Sam2Processor };
  return sam;
}

async function encode() {
  if (!image) throw new Error('No photo loaded.');
  const { model, processor } = await loadSam();
  const inputs = await processor(image);
  const embeddings = await model.get_image_embeddings(inputs);
  embedded = {
    embeddings,
    original: inputs.original_sizes[0],
    reshaped: inputs.reshaped_input_sizes[0],
  };
}

/** All of SAM's candidate masks for one tap (typically: a part, the object, the whole surface). */
async function decode(point: TapPoint) {
  if (!embedded) await encode();
  const { model, processor } = sam!;
  const { embeddings, original, reshaped } = embedded!;
  const sx = reshaped[1] / original[1], sy = reshaped[0] / original[0];

  const input_points = new Tensor('float32', Float32Array.from([point.x * sx, point.y * sy]), [1, 1, 1, 2]);
  const input_labels = new Tensor('int64', BigInt64Array.from([1n]), [1, 1, 1]);

  const out = await model({ ...embeddings, input_points, input_labels });
  const [masks] = await processor.post_process_masks(out.pred_masks, [original], [reshaped]);
  const [h, w] = original;
  return {
    masks: (masks.data as Uint8Array).slice(),
    scores: Array.from(out.iou_scores.data as Float32Array),
    w,
    h,
  };
}
async function autoWall() {
  if (!image) throw new Error('No photo loaded.');
  if (!wallSeg) {
    const pick = await pickDevice();
    wallSeg = (await pipeline('image-segmentation', WALL_ID, {
      device: pick.device,
      dtype: pick.device === 'webgpu' ? 'fp32' : 'q8',
      progress_callback: progress('wall'),
    })) as ImageSegmentationPipeline;
  }
  const results = await wallSeg(image);
  const wall = results.find((r) => r.label === 'wall');
  const w = image.width, h = image.height;
  if (!wall) return { mask: new Uint8Array(w * h), w, h, score: 0 };

  let m = wall.mask as RawImage;
  if (m.width !== w || m.height !== h) m = await m.resize(w, h);
  const mask = new Uint8Array(w * h);
  const ch = m.channels;
  for (let i = 0; i < w * h; i++) mask[i] = m.data[i * ch] > 127 ? 1 : 0;
  return { mask, w, h, score: wall.score ?? 1 };
}

// Handle one request at a time so a tap can't race the photo encoding.
let queue = Promise.resolve();
self.onmessage = (e: MessageEvent<SegRequest>) => {
  queue = queue.then(() => handle(e.data));
};

async function handle(msg: SegRequest) {
  try {
    switch (msg.type) {
      case 'warmup':
        await loadSam();
        post({ type: 'ready', device });
        break;
      case 'setImage':
        image = new RawImage(new Uint8ClampedArray(msg.pixels), msg.width, msg.height, 4).rgb();
        embedded = null;
        post({ type: 'status', status: 'encoding' });
        await encode();
        post({ type: 'status', status: 'encoded' });
        break;
      case 'decode': {
        const r = await decode(msg.point);
        post({ type: 'candidates', id: msg.id, ...r }, [r.masks.buffer]);
        break;
      }
      case 'auto': {
        post({ type: 'status', status: 'auto' });
        const r = await autoWall();
        post({ type: 'mask', id: msg.id, ...r }, [r.mask.buffer]);
        break;
      }
    }
  } catch (err) {
    post({ type: 'error', message: err instanceof Error ? err.message : String(err), request: msg.type });
  }
}

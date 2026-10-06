export interface Enhanced {
  url: string; // object URL of the final composite
  provider: string;
  model: string;
  /** 'wall': AI pixels kept inside the wall only. 'full': the model moved things, so its whole image is used. */
  mode: 'wall' | 'full';
}

export async function enhanceAvailable(): Promise<boolean> {
  try {
    const r = await fetch('/api/enhance/status');
    return r.ok && (await r.json()).available === true;
  } catch {
    return false;
  }
}

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('The enhanced image could not be read.'));
    img.src = src;
  });
}

export interface AiImage { image: string; provider: string; model: string }

/** Send the exact render to the server for a photoreal pass. */
export async function requestEnhancement(opts: {
  render: HTMLCanvasElement;
  photo: ImageData;
  slabName: string;
  finish: string;
}): Promise<AiImage> {
  const { photo } = opts;
  const res = await fetch('/api/enhance', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      image: opts.render.toDataURL('image/jpeg', 0.92),
      slabName: opts.slabName,
      finish: opts.finish,
      width: photo.width,
      height: photo.height,
    }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error ?? `Enhance failed (${res.status}).`);
  return body as AiImage;
}

/**
 * Composite the AI image: outside the wall the original photo stays
 * pixel-for-pixel; inside, the AI version is used.
 */
export async function compositeEnhancement(photo: ImageData, softMask: Uint8Array, body: AiImage): Promise<Enhanced> {
  const img = await loadImage(body.image);
  const W = photo.width, H = photo.height;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(img, 0, 0, W, H);
  const ai = ctx.getImageData(0, 0, W, H);

  // Did the model keep the room where it was? Compare outside the wall.
  let diff = 0, n = 0;
  for (let y = 0; y < H; y += 4) {
    for (let x = 0; x < W; x += 4) {
      const i = y * W + x;
      if (softMask[i] > 0) continue;
      const p = i * 4;
      diff += Math.abs(ai.data[p] - photo.data[p]) + Math.abs(ai.data[p + 1] - photo.data[p + 1]) + Math.abs(ai.data[p + 2] - photo.data[p + 2]);
      n += 3;
    }
  }
  const aligned = n === 0 || diff / n < 22;

  if (aligned) {
    const out = ai.data;
    for (let i = 0; i < W * H; i++) {
      const a = softMask[i] / 255, p = i * 4;
      out[p] = photo.data[p] + (out[p] - photo.data[p]) * a;
      out[p + 1] = photo.data[p + 1] + (out[p + 1] - photo.data[p + 1]) * a;
      out[p + 2] = photo.data[p + 2] + (out[p + 2] - photo.data[p + 2]) * a;
      out[p + 3] = 255;
    }
    ctx.putImageData(ai, 0, 0);
  }
  const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/jpeg', 0.92));
  if (!blob) throw new Error('The enhanced image could not be saved.');
  return { url: URL.createObjectURL(blob), provider: body.provider, model: body.model, mode: aligned ? 'wall' : 'full' };
}

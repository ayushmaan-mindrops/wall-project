/**
 * "Enhance with AI": send the exact marble render to an image-edit model for
 * a photoreal polish (reflections, sheen, contact shadows), then hand the
 * result back to the browser, which keeps it only inside the wall.
 *
 * Runs server-side so API keys never reach the client. Used by the Vite dev
 * server (vite.config.ts) and deployable as a serverless function.
 *
 * Providers, picked by whichever key is set:
 *   GEMINI_API_KEY  -> Google Gemini image editing (default model gemini-3.1-flash-image)
 *   FAL_KEY         -> fal.ai hosted open models (default fal-ai/flux-pro/kontext)
 */

export interface EnhanceEnv {
  GEMINI_API_KEY?: string;
  GEMINI_IMAGE_MODEL?: string;
  FAL_KEY?: string;
  FAL_MODEL?: string;
  /** Testing only: echo the render back instead of calling a model. */
  ENHANCE_MOCK?: string;
}

export interface EnhanceRequest {
  image: string; // data URL (JPEG) of the exact render
  slabName: string;
  finish: string;
  width: number;
  height: number;
}

export interface EnhanceResponse {
  image: string; // data URL
  provider: string;
  model: string;
}

export function enhancePrompt(r: Pick<EnhanceRequest, 'slabName' | 'finish'>) {
  const sheen = r.finish === 'Polished'
    ? 'It is polished marble, not a mirror: add a gentle sheen and soft, diffuse reflections of the light sources, strongest near the light. Only reflect lights and objects that are visible in this photo; never invent windows, doors, people or furniture in the reflections.'
    : r.finish === 'Honed'
      ? 'It is honed stone: a soft satin finish with only faint, diffuse highlights and no mirror reflections.'
      : 'It is leathered stone: matte, with a subtle tactile texture and no reflections.';
  return [
    `This photo shows a room whose wall has been digitally clad in ${r.slabName} marble slabs.`,
    'Make it look like a real photograph of the finished installation.',
    sheen,
    'Add natural contact shadows and ambient occlusion where furniture and fixtures meet the wall, and blend the edges of the stone into the room.',
    'Most important: the cladding was cut out automatically, so its edges are rough. Small patches of the original painted wall still show between plant leaves, around cables and switches, along the edges of furniture and frames, and at the corners. Replace every remaining patch of old painted wall with the same marble, continuing its pattern, so the wall reads as fully clad and the stone passes cleanly behind every object. Do not cover the objects themselves.',
    'Strict rules: keep the marble\'s veining pattern, colours, slab joints and layout exactly as they are, without redrawing, moving or adding veins.',
    'Keep the veins as dark and as contrasty as they are now; the sheen must not wash them out or fade them.',
    'Keep every piece of furniture, object, light fixture, the camera angle and framing exactly the same. Do not add, remove or restyle anything. Do not change the image size or crop.',
  ].join(' ');
}

const ASPECTS: [string, number][] = [
  ['1:1', 1], ['4:3', 4 / 3], ['3:4', 3 / 4], ['3:2', 3 / 2], ['2:3', 2 / 3],
  ['5:4', 5 / 4], ['4:5', 4 / 5], ['16:9', 16 / 9], ['9:16', 9 / 16], ['21:9', 21 / 9],
];
const nearestAspect = (w: number, h: number) =>
  ASPECTS.reduce((best, a) => (Math.abs(Math.log(a[1] / (w / h))) < Math.abs(Math.log(best[1] / (w / h))) ? a : best))[0];

const splitDataUrl = (url: string) => {
  const m = /^data:([^;]+);base64,(.*)$/s.exec(url);
  if (!m) throw new HttpError(400, 'Expected the image as a base64 data URL.');
  return { mime: m[1], data: m[2] };
};

export class HttpError extends Error {
  constructor(readonly status: number, message: string) { super(message); }
}

/**
 * Find the first image in a provider response, whatever its exact shape:
 * Gemini's inline_data / inlineData / output image parts, or a URL list.
 */
function findImage(node: unknown): { data?: string; mime?: string; url?: string } | null {
  if (!node || typeof node !== 'object') return null;
  const o = node as Record<string, unknown>;
  const inline = (o.inlineData ?? o.inline_data) as Record<string, unknown> | undefined;
  if (inline && typeof inline.data === 'string') {
    return { data: inline.data, mime: String(inline.mimeType ?? inline.mime_type ?? 'image/png') };
  }
  const mime = (o.mime_type ?? o.mimeType ?? o.content_type) as string | undefined;
  if (typeof o.data === 'string' && o.data.length > 1000 && (!mime || mime.startsWith('image/'))) {
    return { data: o.data, mime: mime ?? 'image/png' };
  }
  if (typeof o.url === 'string' && /^https?:|^data:image\//.test(o.url) && (o.type === 'image' || mime?.startsWith('image/') || 'width' in o || 'content_type' in o)) {
    return { url: o.url, mime };
  }
  for (const v of Object.values(o)) {
    const hit = Array.isArray(v) ? v.map(findImage).find(Boolean) : findImage(v);
    if (hit) return hit;
  }
  return null;
}

/** Text the model returned instead of an image (usually a refusal or an explanation). */
function findText(node: unknown): string | null {
  if (!node || typeof node !== 'object') return null;
  const o = node as Record<string, unknown>;
  if (typeof o.text === 'string' && o.text.trim()) return o.text.trim();
  for (const v of Object.values(o)) {
    const hit = Array.isArray(v) ? v.map(findText).find(Boolean) : findText(v);
    if (hit) return hit;
  }
  return null;
}

async function readJson(res: Response, provider: string) {
  const text = await res.text();
  let body: unknown;
  try { body = JSON.parse(text); } catch { body = null; }
  if (!res.ok) {
    const msg = (body as { error?: { message?: string } } | null)?.error?.message ?? (body as { detail?: string } | null)?.detail ?? text.slice(0, 300);
    throw new HttpError(502, `${provider} returned ${res.status}: ${msg}`);
  }
  return body;
}

async function toDataUrl(hit: { data?: string; mime?: string; url?: string }) {
  if (hit.data) return `data:${hit.mime ?? 'image/png'};base64,${hit.data}`;
  if (hit.url!.startsWith('data:')) return hit.url!;
  const res = await fetch(hit.url!);
  if (!res.ok) throw new HttpError(502, `Could not download the enhanced image (${res.status}).`);
  const buf = Buffer.from(await res.arrayBuffer());
  return `data:${res.headers.get('content-type') ?? hit.mime ?? 'image/png'};base64,${buf.toString('base64')}`;
}

async function viaGemini(req: EnhanceRequest, env: EnhanceEnv): Promise<EnhanceResponse> {
  const model = env.GEMINI_IMAGE_MODEL || 'gemini-3.1-flash-image';
  const { mime, data } = splitDataUrl(req.image);
  const res = await fetch('https://generativelanguage.googleapis.com/v1beta/interactions', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-goog-api-key': env.GEMINI_API_KEY! },
    body: JSON.stringify({
      model,
      input: [
        { type: 'text', text: enhancePrompt(req) },
        { type: 'image', mime_type: mime, data },
      ],
      response_format: {
        type: 'image',
        mime_type: 'image/jpeg',
        aspect_ratio: nearestAspect(req.width, req.height),
        image_size: '2K',
      },
    }),
  });
  const body = await readJson(res, 'Gemini');
  const hit = findImage(body);
  if (!hit) throw new HttpError(502, `Gemini returned no image${findText(body) ? `: ${findText(body)}` : '.'}`);
  return { image: await toDataUrl(hit), provider: 'Gemini', model };
}

async function viaFal(req: EnhanceRequest, env: EnhanceEnv): Promise<EnhanceResponse> {
  const model = env.FAL_MODEL || 'fal-ai/flux-pro/kontext';
  const res = await fetch(`https://fal.run/${model}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Key ${env.FAL_KEY}` },
    body: JSON.stringify({
      prompt: enhancePrompt(req),
      image_url: req.image,
      output_format: 'jpeg',
      num_images: 1,
    }),
  });
  const body = await readJson(res, 'fal.ai');
  const hit = findImage(body);
  if (!hit) throw new HttpError(502, `fal.ai returned no image${findText(body) ? `: ${findText(body)}` : '.'}`);
  return { image: await toDataUrl(hit), provider: 'fal.ai', model };
}

export function enhanceAvailable(env: EnhanceEnv) {
  return Boolean(env.GEMINI_API_KEY || env.FAL_KEY || env.ENHANCE_MOCK);
}

export async function enhance(req: EnhanceRequest, env: EnhanceEnv): Promise<EnhanceResponse> {
  if (!req?.image || !req.width || !req.height) throw new HttpError(400, 'Missing image or size.');
  if (req.image.length > 12_000_000) throw new HttpError(413, 'Image is too large.');
  if (env.GEMINI_API_KEY) return viaGemini(req, env);
  if (env.FAL_KEY) return viaFal(req, env);
  if (env.ENHANCE_MOCK) {
    await new Promise((r) => setTimeout(r, 1500));
    return { image: req.image, provider: 'mock', model: 'echo' };
  }
  throw new HttpError(503, 'AI enhance is not set up: add GEMINI_API_KEY or FAL_KEY to .env.local and restart the dev server.');
}

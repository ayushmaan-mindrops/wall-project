/**
 * The site's API. One handler serves both the Vite dev/preview server
 * (vite.config.ts) and a serverless catch-all (api/[...path].ts).
 *
 *   POST /api/auth/otp        { phone }              send a sign-in code
 *   POST /api/auth/otp/resend { phone }
 *   POST /api/auth/verify     { phone, otp }         sign in, sets the session cookie
 *   GET  /api/auth/me
 *   POST /api/auth/profile    { name, city, role, email? }
 *   POST /api/auth/logout
 *   GET  /api/designs         · POST /api/designs { slabId, kind, image, areaM2, slabs }
 *   GET  /api/designs/:id/image                      · DELETE /api/designs/:id
 *   POST /api/leads           { designId?, slabId, areaM2, slabs, timeline, message }
 *   GET  /api/enhance/status  · POST /api/enhance    (signed in, daily limit)
 */
import type { IncomingMessage, ServerResponse } from 'node:http';
import { readFileSync, unlinkSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { DATA_DIR, aiUsage, designs, leads, sessions, users, type User } from './db.ts';
import { HttpError, enhance, enhanceAvailable, type EnhanceEnv } from './enhance.ts';
import { normalizePhone, resendOtp, sendOtp, verifyOtp, type OtpEnv } from './otp.ts';
import { notifyLead } from './notify.ts';

export type ApiEnv = EnhanceEnv & OtpEnv & { AI_DAILY_LIMIT?: string; LEAD_WEBHOOK_URL?: string; TRUST_PROXY?: string };

const ROLES = ['Homeowner', 'Architect or interior designer', 'Builder or contractor', 'Other'];
const MAX_BODY = 15_000_000;

async function readBody(req: IncomingMessage & { body?: unknown }): Promise<Record<string, unknown>> {
  if (req.body && typeof req.body === 'object') return req.body as Record<string, unknown>;
  let raw = '';
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > MAX_BODY) throw new HttpError(413, 'Request is too large.');
  }
  if (!raw) return {};
  try { return JSON.parse(raw); } catch { throw new HttpError(400, 'Expected JSON.'); }
}

function cookie(req: IncomingMessage, name: string) {
  const m = new RegExp(`(?:^|;\\s*)${name}=([^;]+)`).exec(req.headers.cookie ?? '');
  return m ? decodeURIComponent(m[1]) : undefined;
}

const publicUser = (u: User) => ({
  id: u.id, phone: u.phone.replace(/^91(\d{5})(\d{5})$/, '+91 $1 $2'), name: u.name, city: u.city, role: u.role, email: u.email, complete: Boolean(u.name && u.city && u.role),
});

const text = (v: unknown, max: number) => String(v ?? '').trim().slice(0, max);
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

export async function handleApi(req: IncomingMessage, res: ServerResponse, env: ApiEnv): Promise<boolean> {
  const url = new URL(req.url ?? '/', 'http://local');
  const path = url.pathname;
  if (!path.startsWith('/api/')) return false;
  const method = req.method ?? 'GET';
  const secure = env.NODE_ENV === 'production';

  const json = (status: number, body: unknown, headers: Record<string, string> = {}) => {
    res.statusCode = status;
    res.setHeader('content-type', 'application/json');
    res.setHeader('cache-control', 'no-store');
    for (const [k, v] of Object.entries(headers)) res.setHeader(k, v);
    res.end(JSON.stringify(body));
  };
  const setSession = (token: string, maxAge: number) =>
    `sid=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${secure ? '; Secure' : ''}`;

  // Behind a proxy or load balancer (TRUST_PROXY=1) the client is the first X-Forwarded-For hop.
  const fwd = env.TRUST_PROXY === '1' ? String(req.headers['x-forwarded-for'] ?? '').split(',')[0].trim() : '';
  const ip = fwd || req.socket.remoteAddress || 'unknown';
  const sid = cookie(req, 'sid');
  const user = sessions.user(sid);
  const requireUser = () => {
    if (!user) throw new HttpError(401, 'Please sign in first.');
    return user;
  };
  const limit = Math.max(0, Number(env.AI_DAILY_LIMIT ?? 3));

  try {
    // Auth
    if (path === '/api/auth/otp' && method === 'POST') {
      const phone = normalizePhone((await readBody(req)).phone);
      return json(200, { sent: true, ...(await sendOtp(phone, env, ip)) }), true;
    }
    if (path === '/api/auth/otp/resend' && method === 'POST') {
      const phone = normalizePhone((await readBody(req)).phone);
      return json(200, { sent: true, ...(await resendOtp(phone, env, ip)) }), true;
    }
    if (path === '/api/auth/verify' && method === 'POST') {
      const body = await readBody(req);
      const phone = normalizePhone(body.phone);
      await verifyOtp(phone, body.otp, env);
      const u = users.byPhone(phone) ?? users.create(phone);
      const s = sessions.create(u.id);
      return json(200, { user: publicUser(u) }, { 'set-cookie': setSession(s.token, s.maxAge) }), true;
    }
    if (path === '/api/auth/me' && method === 'GET') {
      return json(200, { user: user ? publicUser(user) : null }), true;
    }
    if (path === '/api/auth/profile' && method === 'POST') {
      const u = requireUser();
      const body = await readBody(req);
      const name = text(body.name, 80), city = text(body.city, 60), role = text(body.role, 60);
      const email = text(body.email, 120) || null;
      if (!name) throw new HttpError(400, 'Tell us your name.');
      if (!city) throw new HttpError(400, 'Tell us your city.');
      if (!ROLES.includes(role)) throw new HttpError(400, 'Choose what describes you best.');
      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new HttpError(400, 'That email address does not look right.');
      return json(200, { user: publicUser(users.updateProfile(u.id, { name, city, role, email })) }), true;
    }
    if (path === '/api/auth/logout' && method === 'POST') {
      if (sid) sessions.remove(sid);
      return json(200, { ok: true }, { 'set-cookie': setSession('', 0) }), true;
    }

    // Saved designs
    if (path === '/api/designs' && method === 'GET') {
      return json(200, { designs: designs.list(requireUser().id) }), true;
    }
    if (path === '/api/designs' && method === 'POST') {
      const u = requireUser();
      const body = await readBody(req);
      const m = /^data:image\/jpeg;base64,(.+)$/s.exec(String(body.image ?? ''));
      if (!m) throw new HttpError(400, 'Expected the design as a JPEG.');
      const id = designs.create(u.id, {
        slabId: text(body.slabId, 60), kind: body.kind === 'ai' ? 'ai' : 'exact', areaM2: num(body.areaM2), slabs: num(body.slabs),
      });
      writeFileSync(join(DATA_DIR, 'designs', `${id}.jpg`), Buffer.from(m[1], 'base64'));
      return json(200, { id }), true;
    }
    const dm = /^\/api\/designs\/([\w-]+)(\/image)?$/.exec(path);
    if (dm) {
      const u = requireUser();
      if (designs.owner(dm[1]) !== u.id) throw new HttpError(404, 'Design not found.');
      const file = join(DATA_DIR, 'designs', `${dm[1]}.jpg`);
      if (dm[2] && method === 'GET') {
        res.statusCode = 200;
        res.setHeader('content-type', 'image/jpeg');
        res.setHeader('cache-control', 'private, max-age=86400');
        res.end(readFileSync(file));
        return true;
      }
      if (!dm[2] && method === 'DELETE') {
        designs.remove(dm[1]);
        if (existsSync(file)) unlinkSync(file);
        return json(200, { ok: true }), true;
      }
    }

    // Quote requests
    if (path === '/api/leads' && method === 'POST') {
      const u = requireUser();
      if (!u.name) throw new HttpError(400, 'Finish your profile first.');
      const body = await readBody(req);
      const designId = body.designId ? text(body.designId, 60) : null;
      if (designId && designs.owner(designId) !== u.id) throw new HttpError(400, 'Unknown design.');
      const lead = {
        designId, slabId: text(body.slabId, 60), areaM2: num(body.areaM2), slabs: num(body.slabs),
        timeline: text(body.timeline, 60), message: text(body.message, 1000),
      };
      if (!lead.slabId) throw new HttpError(400, 'Choose a slab first.');
      const id = leads.create(u.id, lead);
      await notifyLead({ id, user: u, ...lead }, env);
      return json(200, { id }), true;
    }

    // AI finish: signed-in users only, a few a day, to keep spend predictable.
    if (path === '/api/enhance/status' && method === 'GET') {
      const used = user ? aiUsage.used(user.id) : 0;
      return json(200, { available: enhanceAvailable(env), signedIn: Boolean(user), limit, remaining: Math.max(0, limit - used) }), true;
    }
    if (path === '/api/enhance' && method === 'POST') {
      const u = requireUser();
      if (aiUsage.used(u.id) >= limit) throw new HttpError(429, `You've used today's ${limit} AI finishes. The exact view is always available, and more finishes unlock tomorrow.`);
      const result = await enhance((await readBody(req)) as never, env);
      aiUsage.add(u.id);
      return json(200, { ...result, remaining: Math.max(0, limit - aiUsage.used(u.id)) }), true;
    }

    json(404, { error: 'Not found.' });
  } catch (e) {
    json(e instanceof HttpError ? e.status : 500, { error: e instanceof Error ? e.message : String(e) });
  }
  return true;
}

/**
 * SMS one-time passwords through MSG91 (https://control.msg91.com/api/v5/otp).
 * Without MSG91 keys, a dev mode generates the code locally and returns it to
 * the browser so the flow can be demoed; it refuses to run in production.
 */
import { randomInt } from 'node:crypto';
import { HttpError } from './enhance';

export interface OtpEnv {
  MSG91_AUTHKEY?: string;
  MSG91_TEMPLATE_ID?: string;
  NODE_ENV?: string;
  /** Allow on-screen test codes on a live server (demo only). */
  OTP_TEST_MODE?: string;
  /** Test mode only: one fixed 6-digit code for every number. Needed on serverless hosts, where
   *  "send" and "verify" can land on different instances that don't share memory. */
  OTP_TEST_CODE?: string;
  /** Most codes sent per day across the whole site (default 300), against SMS-pumping fraud. */
  OTP_DAILY_CAP?: string;
}

/** Indian mobile numbers only for now: 10 digits starting 6-9, stored as 91XXXXXXXXXX. */
export function normalizePhone(input: unknown): string {
  const digits = String(input ?? '').replace(/\D/g, '').replace(/^(91|0)(?=\d{10}$)/, '');
  if (!/^[6-9]\d{9}$/.test(digits)) throw new HttpError(400, 'Enter a 10-digit mobile number.');
  return `91${digits}`;
}

// Throttles: per number (one every 30 s, five an hour), per network address
// (ten an hour) and a site-wide daily cap. SMS costs money, and open OTP
// endpoints are a classic target for SMS-pumping fraud.
const sends = new Map<string, number[]>();
const byIp = new Map<string, number[]>();
let day = '', dayCount = 0;
function throttle(phone: string, ip: string, env: OtpEnv) {
  const now = Date.now();
  const recent = (sends.get(phone) ?? []).filter((t) => now - t < 3600e3);
  if (recent.length && now - recent[recent.length - 1] < 30e3) throw new HttpError(429, 'Please wait 30 seconds before asking for another code.');
  if (recent.length >= 5) throw new HttpError(429, 'Too many codes requested for this number. Try again in an hour.');
  const fromIp = (byIp.get(ip) ?? []).filter((t) => now - t < 3600e3);
  if (fromIp.length >= 10) throw new HttpError(429, 'Too many codes requested from your network. Try again later.');
  const today = new Date().toISOString().slice(0, 10);
  if (today !== day) { day = today; dayCount = 0; }
  if (dayCount >= Number(env.OTP_DAILY_CAP ?? 300)) throw new HttpError(503, 'Sign-in is busy right now. Please call the showroom or try again tomorrow.');
  recent.push(now); fromIp.push(now); dayCount++;
  sends.set(phone, recent);
  byIp.set(ip, fromIp);
}

const devCodes = new Map<string, { code: string; expires: number; tries: number }>();
const live = (env: OtpEnv) => Boolean(env.MSG91_AUTHKEY && env.MSG91_TEMPLATE_ID);

async function msg91(path: string, params: Record<string, string>, env: OtpEnv, method = 'GET') {
  const url = `https://control.msg91.com/api/v5/${path}?${new URLSearchParams(params)}`;
  const res = await fetch(url, { method, headers: { authkey: env.MSG91_AUTHKEY!, 'content-type': 'application/json' } });
  const body = (await res.json().catch(() => ({}))) as { type?: string; message?: string };
  return { ok: res.ok && body.type === 'success', message: body.message ?? `MSG91 returned ${res.status}` };
}

export async function sendOtp(phone: string, env: OtpEnv, ip = 'unknown'): Promise<{ devCode?: string }> {
  throttle(phone, ip, env);
  if (live(env)) {
    const r = await msg91('otp', { template_id: env.MSG91_TEMPLATE_ID!, mobile: phone, otp_length: '6', otp_expiry: '10' }, env, 'POST');
    if (!r.ok) throw new HttpError(502, `Could not send the code: ${r.message}`);
    return {};
  }
  if (env.NODE_ENV === 'production' && env.OTP_TEST_MODE !== '1') throw new HttpError(503, 'Sign-in by SMS is not set up yet.');
  const fixed = /^\d{6}$/.test(env.OTP_TEST_CODE ?? '') ? env.OTP_TEST_CODE! : null;
  const code = fixed ?? String(randomInt(100000, 1000000));
  devCodes.set(phone, { code, expires: Date.now() + 10 * 60e3, tries: 0 });
  console.log(`[otp] dev code for +${phone}: ${code}`);
  return { devCode: code };
}

export async function resendOtp(phone: string, env: OtpEnv, ip = 'unknown'): Promise<{ devCode?: string }> {
  if (!live(env)) return sendOtp(phone, env, ip);
  throttle(phone, ip, env);
  const r = await msg91('otp/retry', { mobile: phone, retrytype: 'text' }, env);
  if (!r.ok) throw new HttpError(502, `Could not resend the code: ${r.message}`);
  return {};
}

export async function verifyOtp(phone: string, otp: unknown, env: OtpEnv): Promise<void> {
  const code = String(otp ?? '').replace(/\D/g, '');
  if (code.length !== 6) throw new HttpError(400, 'Enter the 6-digit code.');
  if (live(env)) {
    const r = await msg91('otp/verify', { mobile: phone, otp: code }, env);
    if (!r.ok) throw new HttpError(401, 'That code is not right, or it has expired.');
    return;
  }
  if (/^\d{6}$/.test(env.OTP_TEST_CODE ?? '')) {
    if (code !== env.OTP_TEST_CODE) throw new HttpError(401, 'That code is not right.');
    return;
  }
  const entry = devCodes.get(phone);
  if (!entry || entry.expires < Date.now()) throw new HttpError(401, 'That code has expired. Ask for a new one.');
  if (++entry.tries > 5) { devCodes.delete(phone); throw new HttpError(429, 'Too many tries. Ask for a new code.'); }
  if (entry.code !== code) throw new HttpError(401, 'That code is not right.');
  devCodes.delete(phone);
}

export interface User {
  id: string;
  phone: string;
  name: string | null;
  city: string | null;
  role: string | null;
  email: string | null;
  complete: boolean;
}

export interface SavedDesign {
  id: string;
  slab_id: string;
  kind: 'exact' | 'ai';
  area_m2: number | null;
  slabs: number | null;
  created_at: number;
}

export class ApiError extends Error {
  constructor(readonly status: number, message: string) { super(message); }
}

export async function api<T>(path: string, body?: unknown, method?: string): Promise<T> {
  const res = await fetch(path, {
    method: method ?? (body === undefined ? 'GET' : 'POST'),
    headers: body === undefined ? undefined : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    credentials: 'same-origin',
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, data.error ?? `Something went wrong (${res.status}).`);
  return data as T;
}

export const ROLES = ['Homeowner', 'Architect or interior designer', 'Builder or contractor', 'Other'] as const;
export const TIMELINES = ['As soon as possible', 'In 1 to 3 months', 'In 3 to 6 months', 'Just exploring'] as const;

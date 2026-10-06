/**
 * Storage for the pitch build: Node's built-in SQLite, one file in ./data.
 * Swap for Postgres (Neon, Supabase) before deploying to serverless hosts,
 * whose filesystems don't persist.
 */
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { randomBytes, randomUUID } from 'node:crypto';

export const DATA_DIR = join(process.cwd(), 'data');
mkdirSync(join(DATA_DIR, 'designs'), { recursive: true });

const db = new DatabaseSync(join(DATA_DIR, 'app.db'));
db.exec(`
  PRAGMA journal_mode = WAL;
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    phone TEXT UNIQUE NOT NULL,
    name TEXT,
    city TEXT,
    role TEXT,
    email TEXT,
    created_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id),
    expires_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS designs (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id),
    slab_id TEXT NOT NULL,
    kind TEXT NOT NULL,
    area_m2 REAL,
    slabs INTEGER,
    created_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS leads (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id),
    design_id TEXT,
    slab_id TEXT NOT NULL,
    area_m2 REAL,
    slabs INTEGER,
    timeline TEXT,
    message TEXT,
    created_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS ai_usage (
    user_id TEXT NOT NULL,
    day TEXT NOT NULL,
    count INTEGER NOT NULL,
    PRIMARY KEY (user_id, day)
  );
`);

export interface User {
  id: string;
  phone: string;
  name: string | null;
  city: string | null;
  role: string | null;
  email: string | null;
}

export interface Design {
  id: string;
  slab_id: string;
  kind: 'exact' | 'ai';
  area_m2: number | null;
  slabs: number | null;
  created_at: number;
}

const SESSION_DAYS = 30;

export const users = {
  byPhone: (phone: string) => db.prepare('SELECT id, phone, name, city, role, email FROM users WHERE phone = ?').get(phone) as User | undefined,
  byId: (id: string) => db.prepare('SELECT id, phone, name, city, role, email FROM users WHERE id = ?').get(id) as User | undefined,
  create(phone: string): User {
    const id = randomUUID();
    db.prepare('INSERT INTO users (id, phone, created_at) VALUES (?, ?, ?)').run(id, phone, Date.now());
    return users.byId(id)!;
  },
  updateProfile(id: string, p: { name: string; city: string; role: string; email: string | null }) {
    db.prepare('UPDATE users SET name = ?, city = ?, role = ?, email = ? WHERE id = ?').run(p.name, p.city, p.role, p.email, id);
    return users.byId(id)!;
  },
};

export const sessions = {
  create(userId: string) {
    const token = randomBytes(32).toString('base64url');
    db.prepare('INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)').run(token, userId, Date.now() + SESSION_DAYS * 864e5);
    return { token, maxAge: SESSION_DAYS * 86400 };
  },
  user(token: string | undefined): User | undefined {
    if (!token) return undefined;
    const row = db.prepare('SELECT user_id, expires_at FROM sessions WHERE token = ?').get(token) as { user_id: string; expires_at: number } | undefined;
    if (!row || row.expires_at < Date.now()) return undefined;
    return users.byId(row.user_id);
  },
  remove: (token: string) => { db.prepare('DELETE FROM sessions WHERE token = ?').run(token); },
};

export const designs = {
  create(userId: string, d: { slabId: string; kind: 'exact' | 'ai'; areaM2: number | null; slabs: number | null }) {
    const id = randomUUID();
    db.prepare('INSERT INTO designs (id, user_id, slab_id, kind, area_m2, slabs, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .run(id, userId, d.slabId, d.kind, d.areaM2, d.slabs, Date.now());
    return id;
  },
  list: (userId: string) =>
    db.prepare('SELECT id, slab_id, kind, area_m2, slabs, created_at FROM designs WHERE user_id = ? ORDER BY created_at DESC').all(userId) as unknown as Design[],
  owner: (id: string) => (db.prepare('SELECT user_id FROM designs WHERE id = ?').get(id) as { user_id: string } | undefined)?.user_id,
  get: (id: string) => db.prepare('SELECT id, slab_id, kind, area_m2, slabs, created_at FROM designs WHERE id = ?').get(id) as Design | undefined,
  remove: (id: string) => { db.prepare('DELETE FROM designs WHERE id = ?').run(id); },
};

export const leads = {
  create(userId: string, l: { designId: string | null; slabId: string; areaM2: number | null; slabs: number | null; timeline: string; message: string }) {
    const id = randomUUID();
    db.prepare('INSERT INTO leads (id, user_id, design_id, slab_id, area_m2, slabs, timeline, message, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run(id, userId, l.designId, l.slabId, l.areaM2, l.slabs, l.timeline, l.message, Date.now());
    return id;
  },
};

const today = () => new Date().toISOString().slice(0, 10);
export const aiUsage = {
  used: (userId: string) => ((db.prepare('SELECT count FROM ai_usage WHERE user_id = ? AND day = ?').get(userId, today()) as { count: number } | undefined)?.count ?? 0),
  add(userId: string) {
    db.prepare('INSERT INTO ai_usage (user_id, day, count) VALUES (?, ?, 1) ON CONFLICT(user_id, day) DO UPDATE SET count = count + 1').run(userId, today());
  },
};

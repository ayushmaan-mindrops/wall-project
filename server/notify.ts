/**
 * Tell the sales team about a new quote request. Always appends to
 * data/leads.jsonl; if LEAD_WEBHOOK_URL is set (Slack, Zapier, Make, a Google
 * Apps Script that writes to a Sheet), it also POSTs the lead there.
 */
import { appendFileSync } from 'node:fs';
import { join } from 'node:path';
import { DATA_DIR, type User } from './db.ts';

export interface LeadNotice {
  id: string;
  user: User;
  designId: string | null;
  slabId: string;
  areaM2: number | null;
  slabs: number | null;
  timeline: string;
  message: string;
}

export async function notifyLead(lead: LeadNotice, env: { LEAD_WEBHOOK_URL?: string }) {
  const record = {
    id: lead.id,
    at: new Date().toISOString(),
    name: lead.user.name,
    phone: `+${lead.user.phone}`,
    city: lead.user.city,
    role: lead.user.role,
    email: lead.user.email,
    slab: lead.slabId,
    areaM2: lead.areaM2,
    slabs: lead.slabs,
    timeline: lead.timeline,
    message: lead.message,
    designId: lead.designId,
  };
  appendFileSync(join(DATA_DIR, 'leads.jsonl'), JSON.stringify(record) + '\n');
  console.log(`[lead] ${record.name} (${record.phone}, ${record.city}) wants ${record.slab}, ${record.areaM2 ?? '?'} m²`);
  if (!env.LEAD_WEBHOOK_URL) return;
  try {
    await fetch(env.LEAD_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text: `New quote request: ${record.name}, ${record.city}, ${record.slab}, ${record.areaM2 ?? '?'} m²`, ...record }),
    });
  } catch (e) {
    console.warn('[lead] webhook failed:', e);
  }
}

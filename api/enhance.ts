// Vercel serverless function: POST /api/enhance and GET /api/enhance/status
// (the Vite dev server serves the same routes from vite.config.ts).
import type { IncomingMessage, ServerResponse } from 'node:http';
import { HttpError, enhance, enhanceAvailable } from '../server/enhance';

type Req = IncomingMessage & { body?: unknown };

export default async function handler(req: Req, res: ServerResponse) {
  const send = (status: number, body: unknown) => {
    res.statusCode = status;
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify(body));
  };
  if (req.method === 'GET') return send(200, { available: enhanceAvailable(process.env) });
  if (req.method !== 'POST') return send(405, { error: 'Use POST.' });
  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    send(200, await enhance(body as never, process.env));
  } catch (e) {
    send(e instanceof HttpError ? e.status : 500, { error: e instanceof Error ? e.message : String(e) });
  }
}

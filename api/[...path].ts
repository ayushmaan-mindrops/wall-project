// Vercel serverless function for /api/*. Locally and in Docker the same handler
// runs inside server/prod.ts or the Vite dev server.
import type { IncomingMessage, ServerResponse } from 'node:http';
import { handleApi } from '../server/router';

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  if (!(await handleApi(req, res, process.env))) {
    res.statusCode = 404;
    res.end();
  }
}

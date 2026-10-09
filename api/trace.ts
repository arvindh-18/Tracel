// Serverless function (Vercel style) for POST /api/trace in production.
// The implementation is shared with the dev server; see src/server/traceHandler.ts.
import { clientIp, handleTraceRequest } from '../src/server/traceHandler';

interface Req {
  method?: string;
  body?: unknown;
  headers: Record<string, string | string[] | undefined>;
  socket?: { remoteAddress?: string };
}
interface Res {
  status(code: number): Res;
  setHeader(name: string, value: string): void;
  json(body: unknown): void;
}

export default async function handler(req: Req, res: Res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    res.status(405).json({ error: { code: 'bad_request', message: 'Use POST.' } });
    return;
  }
  const body = typeof req.body === 'string' ? safeJson(req.body) : req.body;
  const out = await handleTraceRequest(body, {
    apiKey: process.env.GEMINI_API_KEY,
    model: process.env.GEMINI_MODEL,
    ip: clientIp(req.headers, req.socket?.remoteAddress),
  });
  res.status(out.status).json(out.body);
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

export const config = { maxDuration: 120 };

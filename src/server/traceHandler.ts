import { z } from 'zod';
import {
  AI_REQUEST_TIMEOUT_MS,
  DEFAULT_AI_MODEL,
  DEFAULT_AI_STEP_LIMIT,
  MAX_AI_STEP_LIMIT,
  MAX_SOURCE_CHARS,
  MAX_STDIN_CHARS,
  RATE_LIMIT_PER_MINUTE,
} from '../engine/adapters/ai/config';
import { EXPLAIN_SYSTEM_PROMPT, SIMULATE_SYSTEM_PROMPT, explainPrompt, simulatePrompt } from '../engine/adapters/ai/prompts';
import { ExplainResult, SimulateResult, describeIssues, geminiSchema } from '../engine/adapters/ai/schema';

// Server-only implementation of POST /api/trace, shared by the Vite dev
// middleware and the serverless function in api/trace.ts. The Gemini key is
// read here from the environment and never sent to the browser.

export const TraceRequest = z.object({
  mode: z.enum(['simulate', 'explain']),
  language: z.enum(['python', 'c', 'cpp']),
  source: z.string().min(1).max(MAX_SOURCE_CHARS, `Source is longer than ${MAX_SOURCE_CHARS} characters.`),
  stdin: z.string().max(MAX_STDIN_CHARS).optional(),
  stepLimit: z.number().int().min(1).max(MAX_AI_STEP_LIMIT).optional(),
  digest: z.array(z.string().max(400)).max(MAX_AI_STEP_LIMIT).optional(),
  error: z.string().max(1000).optional(),
});
export type TraceRequest = z.infer<typeof TraceRequest>;

export type ErrorCode = 'bad_request' | 'missing_key' | 'rate_limited' | 'quota' | 'timeout' | 'invalid_output' | 'upstream';

export interface HandlerResponse {
  status: number;
  body: { result: SimulateResult | ExplainResult; model: string } | { error: { code: ErrorCode; message: string } };
}

export interface ModelCall {
  model: string;
  system: string;
  prompt: string;
  schema: Record<string, unknown>;
  temperature: number;
}
export type ModelCaller = (call: ModelCall, apiKey: string) => Promise<string>;

export interface HandlerEnv {
  apiKey?: string;
  model?: string;
  ip: string;
  /** Injected in tests; defaults to the Gemini SDK. */
  callModel?: ModelCaller;
  now?: () => number;
}

const fail = (status: number, code: ErrorCode, message: string): HandlerResponse => ({ status, body: { error: { code, message } } });

// ---- rate limit (per process; good enough for one dev server or a warm function) ----

const hits = new Map<string, number[]>();

export function resetRateLimit() {
  hits.clear();
}

function rateLimited(ip: string, now: number): boolean {
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < 60_000);
  if (recent.length >= RATE_LIMIT_PER_MINUTE) {
    hits.set(ip, recent);
    return true;
  }
  recent.push(now);
  hits.set(ip, recent);
  return false;
}

// ---- Gemini ----

export const geminiCaller: ModelCaller = async (call, apiKey) => {
  const { GoogleGenAI } = await import('@google/genai');
  const client = new GoogleGenAI({ apiKey });
  const interaction = await client.interactions.create({
    model: call.model,
    system_instruction: call.system,
    input: call.prompt,
    response_format: { type: 'text', mime_type: 'application/json', schema: call.schema },
    generation_config: { temperature: call.temperature },
  });
  return interaction.output_text ?? '';
};

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new TimeoutError()), ms);
    promise.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      }
    );
  });
}

class TimeoutError extends Error {}

export async function handleTraceRequest(rawBody: unknown, env: HandlerEnv): Promise<HandlerResponse> {
  const parsed = TraceRequest.safeParse(rawBody);
  if (!parsed.success) return fail(400, 'bad_request', describeIssues(parsed.error));
  const req = parsed.data;
  if (req.mode === 'simulate' && req.language === 'python') {
    return fail(400, 'bad_request', 'Python runs on the real interpreter; only explain mode is available for it.');
  }
  if (req.mode === 'explain' && !req.digest?.length) return fail(400, 'bad_request', 'Explain mode needs a trace digest.');

  if (!env.apiKey) {
    return fail(503, 'missing_key', 'AI features are not set up on this server: GEMINI_API_KEY is missing. Add it to .env (see .env.example) and restart.');
  }
  if (rateLimited(env.ip, (env.now ?? Date.now)())) {
    return fail(429, 'rate_limited', `Too many AI requests. Tracel allows ${RATE_LIMIT_PER_MINUTE} per minute; wait a moment and try again.`);
  }

  const model = env.model || DEFAULT_AI_MODEL;
  const callModel = env.callModel ?? geminiCaller;
  const simulate = req.mode === 'simulate';
  const resultSchema = simulate ? SimulateResult : ExplainResult;
  const call: ModelCall = {
    model,
    system: simulate ? SIMULATE_SYSTEM_PROMPT : EXPLAIN_SYSTEM_PROMPT,
    prompt: simulate
      ? simulatePrompt({ language: req.language as 'c' | 'cpp', source: req.source, stdin: req.stdin, stepLimit: req.stepLimit ?? DEFAULT_AI_STEP_LIMIT })
      : explainPrompt({ language: req.language, source: req.source, digest: req.digest!, error: req.error }),
    schema: geminiSchema(resultSchema),
    temperature: simulate ? 0 : 0.2,
  };

  // One retry, with the validation problem appended so the model can fix it.
  let problem = '';
  for (let attempt = 0; attempt < 2; attempt++) {
    const prompt = problem ? `${call.prompt}\n\nYour previous answer was rejected: ${problem}\nReturn corrected JSON that follows the schema exactly.` : call.prompt;
    let text: string;
    try {
      text = await withTimeout(callModel({ ...call, prompt }, env.apiKey), AI_REQUEST_TIMEOUT_MS);
    } catch (err) {
      if (err instanceof TimeoutError) return fail(504, 'timeout', 'The AI took too long to answer. Try a shorter program or run again.');
      const status = (err as { status?: number }).status;
      const message = err instanceof Error ? err.message : String(err);
      if (status === 429 || /quota|resource.?exhausted/i.test(message)) {
        return fail(429, 'quota', 'The Gemini API quota or rate limit was reached. Wait a minute, or check the key’s quota in Google AI Studio.');
      }
      if (status === 401 || status === 403 || /api key/i.test(message)) {
        return fail(502, 'upstream', 'Gemini rejected the API key. Check GEMINI_API_KEY in .env.');
      }
      return fail(502, 'upstream', `The Gemini request failed: ${message.slice(0, 200)}`);
    }

    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch {
      problem = 'it was not valid JSON.';
      continue;
    }
    const checked = resultSchema.safeParse(json);
    if (checked.success) return { status: 200, body: { result: checked.data, model } };
    problem = describeIssues(checked.error);
  }
  return fail(502, 'invalid_output', 'The AI returned a trace Tracel could not read, even after a retry. Run again, or simplify the program.');
}

/** Best-effort client IP from common proxy headers. */
export function clientIp(headers: Record<string, string | string[] | undefined>, fallback = 'unknown'): string {
  const fwd = headers['x-forwarded-for'];
  const first = (Array.isArray(fwd) ? fwd[0] : fwd)?.split(',')[0]?.trim();
  return first || (headers['x-real-ip'] as string | undefined) || fallback;
}

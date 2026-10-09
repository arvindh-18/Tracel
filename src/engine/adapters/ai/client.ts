import { z } from 'zod';
import { RunCancelled } from '../types';
import { cacheGet, cacheKey, cachePut } from './cache';
import { AI_REQUEST_TIMEOUT_MS, DEFAULT_AI_MODEL, MAX_SOURCE_CHARS } from './config';
import { getApiKey } from './keyStore';
import {
  ERROR_SYSTEM_PROMPT,
  EXPLAIN_SYSTEM_PROMPT,
  SIMULATE_SYSTEM_PROMPT,
  errorPrompt,
  explainPrompt,
  simulatePrompt,
} from './prompts';
import { ErrorHelp, ExplainResult, SimulateResult, describeIssues, geminiSchema } from './schema';

// Calls Gemini straight from the browser with the visitor's own key. Every
// response is validated with zod (one retry with the problem appended) and
// cached, so a repeat request costs nothing. With no key, nothing is sent.

export type AiErrorCode = 'no_key' | 'invalid_key' | 'quota' | 'timeout' | 'network' | 'invalid_output' | 'too_large' | 'upstream';

export class AiError extends Error {
  constructor(
    public code: AiErrorCode,
    message: string
  ) {
    super(message);
  }
}

export const NO_KEY_MESSAGE = 'Add a free Gemini key in Settings to enable AI features.';

interface Call<T> {
  feature: 'simulate' | 'explain' | 'error';
  schema: z.ZodType<T>;
  system: string;
  prompt: string;
  temperature: number;
  /** Everything besides model and feature that determines the answer. */
  keyParts: unknown[];
  model?: string;
  signal?: AbortSignal;
  /** Build scripts pass a key directly; the site always uses the visitor's stored key. */
  apiKey?: string;
}

async function callGemini(apiKey: string, model: string, system: string, prompt: string, schema: Record<string, unknown>, temperature: number, signal: AbortSignal): Promise<string> {
  const { GoogleGenAI } = await import('@google/genai');
  const client = new GoogleGenAI({ apiKey });
  const interaction = await client.interactions.create(
    {
      model,
      system_instruction: system,
      input: prompt,
      response_format: { type: 'text', mime_type: 'application/json', schema },
      generation_config: { temperature },
    },
    { fetchOptions: { signal }, maxRetries: 0 }
  );
  return interaction.output_text ?? '';
}

/** Gemini's own error text from the SDK error body, when there is one. */
function upstreamMessage(err: unknown): string {
  const body = (err as { body?: unknown }).body;
  if (typeof body === 'string') {
    try {
      const parsed = JSON.parse(body) as unknown;
      const first = (Array.isArray(parsed) ? parsed[0] : parsed) as { error?: { message?: string } };
      if (first?.error?.message) return first.error.message;
    } catch {
      // Not JSON.
    }
  }
  return err instanceof Error ? err.message : String(err);
}

function toAiError(err: unknown, timedOut: boolean): AiError {
  if (timedOut) return new AiError('timeout', 'Gemini took too long to answer. Try again, or try a shorter program.');
  const status = (err as { status?: number }).status;
  const message = upstreamMessage(err);
  if (status === 429 || /quota|resource.?exhausted|rate.?limit/i.test(message)) {
    return new AiError('quota', 'Your free Gemini quota is used up for now; try again later.');
  }
  if (status === 401 || status === 403 || /api.?key/i.test(message)) {
    return new AiError('invalid_key', 'Gemini rejected your API key. Check it in Settings.');
  }
  if (err instanceof TypeError || /fetch|network|failed to fetch/i.test(message)) {
    return new AiError('network', "Couldn't reach Gemini. Check your connection.");
  }
  return new AiError('upstream', `Gemini request failed: ${message.slice(0, 160)}`);
}

export async function generate<T>(call: Call<T>): Promise<T> {
  const apiKey = call.apiKey ?? getApiKey();
  if (!apiKey) throw new AiError('no_key', NO_KEY_MESSAGE);
  const model = call.model ?? DEFAULT_AI_MODEL;
  const key = await cacheKey([model, call.feature, ...call.keyParts]);
  const cached = await cacheGet<T>(key);
  if (cached !== undefined) return cached;

  const jsonSchema = geminiSchema(call.schema);
  let problem = '';
  for (let attempt = 0; attempt < 2; attempt++) {
    if (call.signal?.aborted) throw new RunCancelled();
    const prompt = problem ? `${call.prompt}\n\nYour previous answer was rejected: ${problem}\nReturn corrected JSON that follows the schema exactly.` : call.prompt;

    // One controller for both Stop (the caller's signal) and the timeout.
    const controller = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, AI_REQUEST_TIMEOUT_MS);
    const forward = () => controller.abort();
    call.signal?.addEventListener('abort', forward);

    let text: string;
    try {
      text = await callGemini(apiKey, model, call.system, prompt, jsonSchema, call.temperature, controller.signal);
    } catch (err) {
      if (call.signal?.aborted) throw new RunCancelled();
      throw toAiError(err, timedOut);
    } finally {
      clearTimeout(timer);
      call.signal?.removeEventListener('abort', forward);
    }

    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch {
      problem = 'it was not valid JSON.';
      continue;
    }
    const checked = call.schema.safeParse(json);
    if (checked.success) {
      await cachePut(key, checked.data);
      return checked.data;
    }
    problem = describeIssues(checked.error);
  }
  throw new AiError('invalid_output', 'Gemini returned an answer Tracel could not use, even after a retry. Try again.');
}

function checkSize(source: string) {
  if (source.length > MAX_SOURCE_CHARS) {
    throw new AiError('too_large', `AI features handle programs up to ${MAX_SOURCE_CHARS.toLocaleString()} characters.`);
  }
}

export function simulate(
  req: { language: 'c' | 'cpp'; source: string; stdin?: string; stepLimit: number; model?: string },
  signal?: AbortSignal
): Promise<SimulateResult> {
  checkSize(req.source);
  return generate({
    feature: 'simulate',
    schema: SimulateResult,
    system: SIMULATE_SYSTEM_PROMPT,
    prompt: simulatePrompt(req),
    temperature: 0,
    keyParts: [req.language, req.source, req.stdin ?? '', req.stepLimit],
    model: req.model,
    signal,
  });
}

export function explain(
  req: { language: 'python' | 'c' | 'cpp'; source: string; stdin?: string; digest: string[]; error?: string; model?: string; apiKey?: string },
  signal?: AbortSignal
): Promise<ExplainResult> {
  checkSize(req.source);
  return generate({
    feature: 'explain',
    schema: ExplainResult,
    system: EXPLAIN_SYSTEM_PROMPT,
    prompt: explainPrompt(req),
    temperature: 0.2,
    keyParts: [req.language, req.source, req.stdin ?? '', req.digest],
    model: req.model,
    signal,
    apiKey: req.apiKey,
  });
}

export function explainError(
  req: {
    language: 'python' | 'c' | 'cpp';
    source: string;
    stdin?: string;
    error: { kind: string; title: string; message: string; line: number };
    context: string[];
    model?: string;
  },
  signal?: AbortSignal
): Promise<ErrorHelp> {
  checkSize(req.source);
  return generate({
    feature: 'error',
    schema: ErrorHelp,
    system: ERROR_SYSTEM_PROMPT,
    prompt: errorPrompt(req),
    temperature: 0.2,
    keyParts: [req.language, req.source, req.stdin ?? '', req.error, req.context],
    model: req.model,
    signal,
  });
}

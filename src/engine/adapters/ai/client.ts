import { DEFAULT_AI_MODEL } from './config';
import { ExplainResult, SimulateResult } from './schema';
import { RunCancelled } from '../types';

// Browser client for POST /api/trace. Results are cached in memory and in
// localStorage, keyed by everything that affects them, so re-runs never call
// the API again.

export type AiErrorCode = 'missing_key' | 'rate_limited' | 'quota' | 'timeout' | 'invalid_output' | 'upstream' | 'bad_request' | 'network';

export class AiError extends Error {
  constructor(
    public code: AiErrorCode,
    message: string
  ) {
    super(message);
  }
}

interface SimulateRequest {
  mode: 'simulate';
  language: 'c' | 'cpp';
  source: string;
  stdin?: string;
  stepLimit: number;
}
interface ExplainRequest {
  mode: 'explain';
  language: 'python' | 'c' | 'cpp';
  source: string;
  digest: string[];
  error?: string;
}

const STORAGE_PREFIX = 'tracel:ai:';
const MAX_STORED_CHARS = 400_000;
const memory = new Map<string, unknown>();

function hash(text: string): string {
  // FNV-1a, 52 bits: plenty for a cache key.
  let h = 0xcbf29ce484222325n;
  for (let i = 0; i < text.length; i++) {
    h ^= BigInt(text.charCodeAt(i));
    h = (h * 0x100000001b3n) & 0xfffffffffffffn;
  }
  return h.toString(36);
}

function cacheKey(req: SimulateRequest | ExplainRequest): string {
  return STORAGE_PREFIX + hash(JSON.stringify([DEFAULT_AI_MODEL, req]));
}

function readCache<T>(key: string): T | undefined {
  if (memory.has(key)) return memory.get(key) as T;
  try {
    const stored = localStorage.getItem(key);
    if (stored) {
      const value = JSON.parse(stored) as T;
      memory.set(key, value);
      return value;
    }
  } catch {
    // Storage unavailable or corrupt; treat as a miss.
  }
  return undefined;
}

function writeCache(key: string, value: unknown) {
  memory.set(key, value);
  try {
    const text = JSON.stringify(value);
    if (text.length <= MAX_STORED_CHARS) localStorage.setItem(key, text);
  } catch {
    // Full or unavailable storage only loses the persistent copy.
  }
}

export function clearAiCache() {
  memory.clear();
  try {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i);
      if (k?.startsWith(STORAGE_PREFIX)) localStorage.removeItem(k);
    }
  } catch {
    // Nothing persisted.
  }
}

async function post<T>(req: SimulateRequest | ExplainRequest, signal?: AbortSignal): Promise<T> {
  const key = cacheKey(req);
  const cached = readCache<T>(key);
  if (cached) return cached;

  let res: Response;
  try {
    res = await fetch('/api/trace', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req),
      signal,
    });
  } catch (err) {
    if (signal?.aborted || (err as Error).name === 'AbortError') throw new RunCancelled();
    throw new AiError('network', 'Could not reach the Tracel AI service. Check your connection and that the dev server is running.');
  }
  let body: { result?: T; error?: { code: AiErrorCode; message: string } };
  try {
    body = await res.json();
  } catch {
    if (signal?.aborted) throw new RunCancelled();
    throw new AiError('upstream', `The AI service answered with an unexpected response (HTTP ${res.status}).`);
  }
  if (!res.ok || !body.result) {
    throw new AiError(body.error?.code ?? 'upstream', body.error?.message ?? `The AI service failed (HTTP ${res.status}).`);
  }
  writeCache(key, body.result);
  return body.result;
}

export function simulate(req: Omit<SimulateRequest, 'mode'>, signal?: AbortSignal): Promise<SimulateResult> {
  return post<SimulateResult>({ mode: 'simulate', ...req }, signal);
}

export function explain(req: Omit<ExplainRequest, 'mode'>, signal?: AbortSignal): Promise<ExplainResult> {
  return post<ExplainResult>({ mode: 'explain', ...req }, signal);
}

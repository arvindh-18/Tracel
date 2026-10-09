import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ModelCaller, handleTraceRequest, resetRateLimit } from '../../src/server/traceHandler';
import { ExplainResult, SimulateResult, geminiSchema } from '../../src/engine/adapters/ai/schema';
import { MAX_SOURCE_CHARS, RATE_LIMIT_PER_MINUTE } from '../../src/engine/adapters/ai/config';
import { SWAP, SWAP_SOURCE } from '../fixtures/ai';

const simulateBody = { mode: 'simulate', language: 'c', source: SWAP_SOURCE, stepLimit: 500 };
const env = (callModel: ModelCaller, extra = {}) => ({ apiKey: 'test-key', ip: '1.2.3.4', callModel, ...extra });
const errorOf = (out: Awaited<ReturnType<typeof handleTraceRequest>>) => ('error' in out.body ? out.body.error : null);

beforeEach(() => resetRateLimit());

describe('/api/trace handler', () => {
  it('returns validated model output', async () => {
    const callModel = vi.fn<ModelCaller>(async () => JSON.stringify(SWAP));
    const out = await handleTraceRequest(simulateBody, env(callModel));
    expect(out.status).toBe(200);
    expect('result' in out.body && out.body.result).toEqual(SWAP);
    const call = callModel.mock.calls[0]![0];
    expect(call.temperature).toBe(0);
    expect(call.prompt).toContain('  9     swap(&x, &y);');
    expect(call.system).toContain('EXAMPLE 2');
  });

  it('rejects oversize source, an unknown language and Python simulation', async () => {
    const callModel = vi.fn<ModelCaller>();
    const big = await handleTraceRequest({ ...simulateBody, source: 'x'.repeat(MAX_SOURCE_CHARS + 1) }, env(callModel));
    expect(big.status).toBe(400);
    expect(errorOf(big)?.message).toContain(String(MAX_SOURCE_CHARS));
    const lang = await handleTraceRequest({ ...simulateBody, language: 'rust' }, env(callModel));
    expect(lang.status).toBe(400);
    expect(errorOf(lang)?.code).toBe('bad_request');
    const py = await handleTraceRequest({ ...simulateBody, language: 'python' }, env(callModel));
    expect(py.status).toBe(400);
    expect(callModel).not.toHaveBeenCalled();
  });

  it('explains a missing API key without calling the model', async () => {
    const callModel = vi.fn<ModelCaller>();
    const out = await handleTraceRequest(simulateBody, { ip: 'x', callModel });
    expect(out.status).toBe(503);
    expect(errorOf(out)).toMatchObject({ code: 'missing_key' });
    expect(errorOf(out)?.message).toContain('GEMINI_API_KEY');
    expect(callModel).not.toHaveBeenCalled();
  });

  it('retries once with the validation error, then succeeds', async () => {
    const bad = { steps: [{ line: 'seven', ops: [] }] };
    const callModel = vi.fn<ModelCaller>().mockResolvedValueOnce(JSON.stringify(bad)).mockResolvedValueOnce(JSON.stringify(SWAP));
    const out = await handleTraceRequest(simulateBody, env(callModel));
    expect(out.status).toBe(200);
    expect(callModel).toHaveBeenCalledTimes(2);
    const retryPrompt = callModel.mock.calls[1]![0].prompt;
    expect(retryPrompt).toContain('previous answer was rejected');
    expect(retryPrompt).toContain('steps.0.line');
  });

  it('gives up with a friendly error after a second invalid answer', async () => {
    const callModel = vi.fn<ModelCaller>(async () => 'not json');
    const out = await handleTraceRequest(simulateBody, env(callModel));
    expect(out.status).toBe(502);
    expect(errorOf(out)?.code).toBe('invalid_output');
    expect(callModel).toHaveBeenCalledTimes(2);
  });

  it('maps quota errors and rate-limits each IP', async () => {
    const quota = await handleTraceRequest(
      simulateBody,
      env(async () => {
        throw Object.assign(new Error('RESOURCE_EXHAUSTED'), { status: 429 });
      })
    );
    expect(errorOf(quota)?.code).toBe('quota');

    resetRateLimit();
    const ok: ModelCaller = async () => JSON.stringify(SWAP);
    for (let i = 0; i < RATE_LIMIT_PER_MINUTE; i++) expect((await handleTraceRequest(simulateBody, env(ok))).status).toBe(200);
    const limited = await handleTraceRequest(simulateBody, env(ok));
    expect(limited.status).toBe(429);
    expect(errorOf(limited)?.code).toBe('rate_limited');
    expect((await handleTraceRequest(simulateBody, env(ok, { ip: '5.6.7.8' }))).status).toBe(200);
  });

  it('handles explain mode with a digest', async () => {
    const explanation: ExplainResult = { narrations: ['x is 3'], errorExplanation: undefined };
    const callModel = vi.fn<ModelCaller>(async () => JSON.stringify(explanation));
    const out = await handleTraceRequest({ mode: 'explain', language: 'python', source: 'x = 3\n', digest: ['1. L1: x=3'] }, env(callModel));
    expect(out.status).toBe(200);
    expect(callModel.mock.calls[0]![0].prompt).toContain('1. L1: x=3');
    expect((await handleTraceRequest({ mode: 'explain', language: 'python', source: 'x = 3\n' }, env(callModel))).status).toBe(400);
  });
});

describe('Gemini schema', () => {
  it('produces a JSON schema without keywords Gemini rejects', () => {
    const text = JSON.stringify(geminiSchema(SimulateResult));
    expect(text).not.toContain('$schema');
    expect(text).not.toContain('additionalProperties');
    expect(text).toContain('"op"');
  });

  it('accepts the fixtures and rejects malformed values', () => {
    expect(SimulateResult.safeParse(SWAP).success).toBe(true);
    const badValue = { steps: [{ line: 1, ops: [{ op: 'declare', name: 'x', value: { k: 'integer', v: '1' } }] }] };
    expect(SimulateResult.safeParse(badValue).success).toBe(false);
    expect(SimulateResult.safeParse({ steps: [{ line: 1, ops: [{ op: 'teleport' }] }] }).success).toBe(false);
  });
});

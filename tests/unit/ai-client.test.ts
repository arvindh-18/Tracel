import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SWAP, SWAP_SOURCE } from '../fixtures/ai';

// The Gemini SDK is mocked: tests never touch the network.
const create = vi.fn();
const constructed: unknown[] = [];
vi.mock('@google/genai', () => ({
  GoogleGenAI: class {
    interactions = { create };
    constructor(opts: unknown) {
      constructed.push(opts);
    }
  },
}));

const store = new Map<string, string>();
vi.stubGlobal('localStorage', {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
});

const { simulate, explainError, AiError } = await import('../../src/engine/adapters/ai/client');
const { setApiKey, forgetApiKey } = await import('../../src/engine/adapters/ai/keyStore');
const { clearMemoryCache } = await import('../../src/engine/adapters/ai/cache');

const req = { language: 'c' as const, source: SWAP_SOURCE, stepLimit: 500 };
const reply = (value: unknown) => ({ output_text: typeof value === 'string' ? value : JSON.stringify(value) });

beforeEach(() => {
  create.mockReset();
  constructed.length = 0;
  store.clear();
  clearMemoryCache();
});

describe('Gemini browser client', () => {
  it('makes no request at all without a key', async () => {
    await expect(simulate(req)).rejects.toMatchObject({ code: 'no_key' });
    expect(create).not.toHaveBeenCalled();
    expect(constructed).toHaveLength(0);
  });

  it('sends structured-output requests with the visitor key, temperature 0 for simulation', async () => {
    setApiKey('visitor-key');
    create.mockResolvedValueOnce(reply(SWAP));
    expect(await simulate(req)).toEqual(SWAP);
    expect(constructed).toEqual([{ apiKey: 'visitor-key' }]);
    const [params, options] = create.mock.calls[0]!;
    expect(params).toMatchObject({ model: 'gemini-3.8-flash', generation_config: { temperature: 0 } });
    expect(params.response_format).toMatchObject({ type: 'text', mime_type: 'application/json' });
    expect(params.response_format.schema.properties.steps).toBeDefined();
    expect(params.input).toContain('  9     swap(&x, &y);');
    expect(options.fetchOptions.signal).toBeInstanceOf(AbortSignal);
  });

  it('retries once with the validation error appended, then succeeds', async () => {
    setApiKey('k');
    create.mockResolvedValueOnce(reply({ steps: [{ line: 'seven', ops: [] }] })).mockResolvedValueOnce(reply(SWAP));
    expect(await simulate(req)).toEqual(SWAP);
    expect(create).toHaveBeenCalledTimes(2);
    expect(create.mock.calls[1]![0].input).toContain('previous answer was rejected');
    expect(create.mock.calls[1]![0].input).toContain('steps.0.line');
  });

  it('fails gracefully after a second invalid answer', async () => {
    setApiKey('k');
    create.mockResolvedValue(reply('not json'));
    await expect(simulate(req)).rejects.toMatchObject({ code: 'invalid_output' });
    expect(create).toHaveBeenCalledTimes(2);
  });

  it('answers repeat requests from the cache without calling the SDK', async () => {
    setApiKey('k');
    create.mockResolvedValueOnce(reply(SWAP));
    await simulate(req);
    await simulate(req);
    expect(create).toHaveBeenCalledTimes(1);
    create.mockResolvedValueOnce(reply(SWAP));
    await simulate({ ...req, stdin: 'different' }); // stdin is part of the key: a miss
    expect(create).toHaveBeenCalledTimes(2);
  });

  it('maps quota, bad key and network failures to friendly errors', async () => {
    setApiKey('k');
    const error = { language: 'c' as const, source: 'int main() { return 1 / 0; }', error: { kind: 'DivisionByZero', title: 'Division by zero', message: 'x', line: 1 }, context: [] };
    create.mockRejectedValueOnce(Object.assign(new Error('429'), { status: 429 }));
    await expect(explainError(error)).rejects.toMatchObject({ code: 'quota', message: expect.stringContaining('quota is used up') });
    create.mockRejectedValueOnce(
      Object.assign(new Error('400'), { status: 400, body: JSON.stringify([{ error: { message: 'API key not valid.' } }]) })
    );
    await expect(explainError({ ...error, context: ['a'] })).rejects.toMatchObject({ code: 'invalid_key' });
    create.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    await expect(explainError({ ...error, context: ['b'] })).rejects.toMatchObject({ code: 'network' });
    expect(new AiError('quota', 'x')).toBeInstanceOf(Error);
  });

  it('forgetting the key stops all requests again', async () => {
    setApiKey('k');
    forgetApiKey();
    await expect(simulate(req)).rejects.toMatchObject({ code: 'no_key' });
    expect(create).not.toHaveBeenCalled();
  });
});

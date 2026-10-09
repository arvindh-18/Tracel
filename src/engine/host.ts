import { LanguageAdapter, RunCancelled, RunRequest } from './adapters/types';
import { PythonAdapter } from './adapters/python/PythonAdapter';
import { ClikeAdapter } from './adapters/clike/ClikeAdapter';
import { AiError, explain, simulate } from './adapters/ai/client';
import { DEFAULT_AI_STEP_LIMIT } from './adapters/ai/config';
import { applyNarrations, lensHintsById, mergeExplanation, traceDigest } from './adapters/ai/explainMerge';
import { getApiKey } from './adapters/ai/keyStore';
import { replay } from './adapters/ai/replay';
import { normalize } from '../trace/normalize';
import { Trace } from '../trace/schema';

export interface ExecuteOptions {
  onProgress?: (steps: number) => void;
  onStatus?: (message: string) => void;
  /** Add Gemini narration, an overview and lens choices to the real trace (needs a key). */
  aiExplanations?: boolean;
  aiModel?: string;
}

class EngineHost {
  private adapters = new Map<string, LanguageAdapter>();
  private aiController: AbortController | null = null;

  constructor() {
    this.adapters.set('python', new PythonAdapter());
    this.adapters.set('c', new ClikeAdapter('c'));
    this.adapters.set('cpp', new ClikeAdapter('cpp'));
  }

  getAdapter(lang: 'python' | 'c' | 'cpp'): LanguageAdapter {
    const adapter = this.adapters.get(lang);
    if (!adapter) {
      throw new Error(`No adapter available for language: ${lang}`);
    }
    return adapter;
  }

  /** Runs the program on its real engine; AI only adds explanations afterwards. */
  async execute(
    lang: 'python' | 'c' | 'cpp',
    source: string,
    stdin = '',
    stepLimit = 5000,
    options: ExecuteOptions = {}
  ): Promise<Trace> {
    const adapter = this.getAdapter(lang);
    await adapter.prepare();
    const req: RunRequest = { source, stdin, stepLimit, onStatus: options.onStatus };
    const trace = normalize(await adapter.run(req, options.onProgress));
    if (options.aiExplanations && getApiKey()) return this.explain(trace, stdin, options);
    return trace;
  }

  /**
   * Has Gemini simulate a C/C++ program the interpreter can't run. The model
   * describes operations; replay() checks them and builds the trace.
   */
  async simulateWithAi(lang: 'c' | 'cpp', source: string, stdin = '', options: { stepLimit?: number; aiModel?: string } = {}): Promise<Trace> {
    const stepLimit = options.stepLimit ?? DEFAULT_AI_STEP_LIMIT;
    this.aiController = new AbortController();
    try {
      const result = await simulate({ language: lang, source, stdin, stepLimit, model: options.aiModel }, this.aiController.signal);
      const replayed = replay(result, { language: lang, source, stdin, stepLimit });
      const trace = normalize({ ...replayed.rawTrace, engine: 'ai' });
      applyNarrations(trace, replayed.narrations);
      Object.assign(trace.lensHints, lensHintsById(trace, replayed.lensHints));
      return trace;
    } finally {
      this.aiController = null;
    }
  }

  /** Best effort: any failure keeps the real trace and says why in aiNotice. */
  private async explain(trace: Trace, stdin: string, options: ExecuteOptions): Promise<Trace> {
    const digest = traceDigest(trace);
    if (!digest) {
      return trace.steps.length ? { ...trace, aiNotice: 'AI explanations skip traces longer than 400 steps.' } : trace;
    }
    options.onStatus?.('Adding AI explanations…');
    this.aiController = new AbortController();
    try {
      const result = await explain(
        { language: trace.language, source: trace.source, stdin, digest, error: trace.error?.message, model: options.aiModel },
        this.aiController.signal
      );
      return mergeExplanation(trace, result);
    } catch (err) {
      if (err instanceof RunCancelled) throw err;
      return { ...trace, aiNotice: err instanceof AiError ? err.message : 'AI explanations failed for this run.' };
    } finally {
      this.aiController = null;
    }
  }

  cancel(lang: 'python' | 'c' | 'cpp') {
    this.aiController?.abort();
    this.getAdapter(lang).cancel?.();
  }
}

export const engineHost = new EngineHost();

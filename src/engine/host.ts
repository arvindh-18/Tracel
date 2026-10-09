import { LanguageAdapter, RunCancelled, RunRequest } from './adapters/types';
import { PythonAdapter } from './adapters/python/PythonAdapter';
import { AiClikeAdapter } from './adapters/ai/AiClikeAdapter';
import { AiError, explain } from './adapters/ai/client';
import { applyNarrations, lensHintsById, mergeExplanation, traceDigest } from './adapters/ai/explainMerge';
import { RawTrace, normalize } from '../trace/normalize';
import { Trace } from '../trace/schema';

export interface ExecuteOptions {
  onProgress?: (steps: number) => void;
  onStatus?: (message: string) => void;
  /** Add Gemini narration, lens choices and error explanations to the real trace. */
  aiExplanations?: boolean;
  /** C/C++: when Gemini simulates instead of the interpreter. */
  aiSimulate?: 'auto' | 'always' | 'never';
  aiStepLimit?: number;
}

class EngineHost {
  private adapters = new Map<string, LanguageAdapter>();
  private explainController: AbortController | null = null;

  constructor() {
    this.adapters.set('python', new PythonAdapter());
    this.adapters.set('c', new AiClikeAdapter('c'));
    this.adapters.set('cpp', new AiClikeAdapter('cpp'));
  }

  getAdapter(lang: 'python' | 'c' | 'cpp'): LanguageAdapter {
    const adapter = this.adapters.get(lang);
    if (!adapter) {
      throw new Error(`No adapter available for language: ${lang}`);
    }
    return adapter;
  }

  async execute(
    lang: 'python' | 'c' | 'cpp',
    source: string,
    stdin = '',
    stepLimit = 5000,
    options: ExecuteOptions = {}
  ): Promise<Trace> {
    const adapter = this.getAdapter(lang);
    await adapter.prepare();

    const req: RunRequest = {
      source,
      stdin,
      stepLimit,
      onStatus: options.onStatus,
      ai: { simulate: options.aiSimulate ?? 'auto', stepLimit: options.aiStepLimit ?? 500 },
    };
    const rawTrace: RawTrace = await adapter.run(req, options.onProgress);

    let trace = normalize(rawTrace);
    if (rawTrace.engine === 'ai') {
      // A simulated trace carries the model's own narration and lens choices.
      if (rawTrace.aiNarrations) applyNarrations(trace, rawTrace.aiNarrations);
      if (rawTrace.aiLensHints) Object.assign(trace.lensHints, lensHintsById(trace, rawTrace.aiLensHints));
      return trace;
    }
    if (options.aiExplanations) trace = await this.explain(trace, options.onStatus);
    return trace;
  }

  /** The explain pass is best effort: any failure keeps the real trace and notes why. */
  private async explain(trace: Trace, onStatus?: (message: string) => void): Promise<Trace> {
    const digest = traceDigest(trace);
    if (!digest) {
      return trace.steps.length ? { ...trace, aiNotice: 'AI explanations skip traces longer than 400 steps.' } : trace;
    }
    onStatus?.('Adding AI explanations…');
    this.explainController = new AbortController();
    try {
      const result = await explain(
        { language: trace.language, source: trace.source, digest, error: trace.error?.message },
        this.explainController.signal
      );
      return mergeExplanation(trace, result);
    } catch (err) {
      if (err instanceof RunCancelled) throw err;
      return { ...trace, aiNotice: err instanceof AiError ? err.message : 'AI explanations failed for this run.' };
    } finally {
      this.explainController = null;
    }
  }

  cancel(lang: 'python' | 'c' | 'cpp') {
    this.explainController?.abort();
    this.getAdapter(lang).cancel?.();
  }
}

export const engineHost = new EngineHost();

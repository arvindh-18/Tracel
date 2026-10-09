import { LanguageAdapter } from './adapters/types';
import { PythonAdapter } from './adapters/python/PythonAdapter';
import { ClikeAdapter } from './adapters/clike/ClikeAdapter';
import { RawTrace, normalize } from '../trace/normalize';
import { Trace } from '../trace/schema';

class EngineHost {
  private adapters = new Map<string, LanguageAdapter>();

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

  async execute(
    lang: 'python' | 'c' | 'cpp',
    source: string,
    stdin = '',
    stepLimit = 5000,
    onProgress?: (steps: number) => void
  ): Promise<Trace> {
    const adapter = this.getAdapter(lang);
    await adapter.prepare();

    const rawTrace: RawTrace = await adapter.run(
      { source, stdin, stepLimit },
      onProgress
    );

    return normalize(rawTrace);
  }

  cancel(lang: 'python' | 'c' | 'cpp') {
    this.getAdapter(lang).cancel?.();
  }
}

export const engineHost = new EngineHost();


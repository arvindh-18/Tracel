import { LanguageAdapter, RunCancelled, RunRequest, SupportInfo } from '../types';
import { RawTrace } from '../../../trace/normalize';
import { ClikeAdapter } from '../clike/ClikeAdapter';
import { AiError, simulate } from './client';
import { DEFAULT_AI_STEP_LIMIT } from './config';
import { replay } from './replay';

/**
 * C/C++ engine: Tracel's exact interpreter first. Gemini simulates the
 * program only when the interpreter can't run it (an unsupported feature),
 * or when Settings ask for the AI engine.
 */
export class AiClikeAdapter implements LanguageAdapter {
  id: 'c' | 'cpp';
  displayName: string;
  engineLabel: string;
  fileExtension: string;
  supportInfo: SupportInfo;

  private interpreter: ClikeAdapter;
  private controller: AbortController | null = null;

  constructor(lang: 'c' | 'cpp') {
    this.interpreter = new ClikeAdapter(lang);
    this.id = lang;
    this.displayName = this.interpreter.displayName;
    this.engineLabel = this.interpreter.engineLabel;
    this.fileExtension = this.interpreter.fileExtension;
    this.supportInfo = {
      ...this.interpreter.supportInfo,
      supportedFeatures: [
        ...this.interpreter.supportInfo.supportedFeatures,
        'Anything else (classes, templates, enums...) is simulated by Gemini when an API key is configured',
      ],
    };
  }

  prepare(): Promise<void> {
    return this.interpreter.prepare();
  }

  async run(req: RunRequest, onProgress?: (stepCount: number) => void): Promise<RawTrace> {
    const ai = req.ai ?? { simulate: 'auto', stepLimit: DEFAULT_AI_STEP_LIMIT };
    let native: RawTrace | undefined;
    if (ai.simulate !== 'always') {
      native = await this.interpreter.run(req, onProgress);
      if (ai.simulate === 'never' || native.error?.phase !== 'unsupported') return native;
    }

    req.onStatus?.('Analyzing code with AI…');
    this.controller = new AbortController();
    try {
      const result = await simulate(
        { language: this.id, source: req.source, stdin: req.stdin, stepLimit: ai.stepLimit },
        this.controller.signal
      );
      const replayed = replay(result, { language: this.id, source: req.source, stdin: req.stdin, stepLimit: ai.stepLimit });
      return {
        ...replayed.rawTrace,
        engine: 'ai',
        aiNarrations: replayed.narrations,
        aiLensHints: replayed.lensHints,
      };
    } catch (err) {
      if (err instanceof RunCancelled) throw err;
      const message = err instanceof AiError ? err.message : `The AI simulation failed: ${(err as Error).message}`;
      if (native?.error) {
        // Keep the interpreter's precise "unsupported" message, and say why the fallback didn't run.
        return { ...native, error: { ...native.error, explanation: `${native.error.explanation} The Gemini fallback could not run either: ${message}` } };
      }
      return {
        language: this.id,
        source: req.source,
        steps: [],
        stdout: '',
        status: 'error',
        engine: 'ai',
        error: {
          phase: 'runtime',
          kind: err instanceof AiError ? `Ai_${err.code}` : 'AiError',
          line: 1,
          message,
          title: 'AI simulation unavailable',
          explanation: message,
          context: [],
        },
      };
    } finally {
      this.controller = null;
    }
  }

  cancel(): void {
    this.controller?.abort();
  }
}

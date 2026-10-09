import { LanguageAdapter, RunCancelled, RunRequest, SupportInfo } from '../types';
import { RawTrace } from '../../../trace/normalize';

const HARD_TIMEOUT_MS = 8000;

export class ClikeAdapter implements LanguageAdapter {
  id: 'c' | 'cpp';
  displayName: string;
  engineLabel: string;
  fileExtension: string;

  constructor(lang: 'c' | 'cpp') {
    this.id = lang;
    this.displayName = lang === 'c' ? 'C' : 'C++';
    this.engineLabel =
      lang === 'c'
        ? 'Tracel C interpreter (subset)'
        : 'Tracel C++ interpreter (subset)';
    this.fileExtension = lang === 'c' ? '.c' : '.cpp';
  }

  private worker: Worker | null = null;
  private requestId = 0;
  private rejectPending: ((err: Error) => void) | null = null;

  supportInfo: SupportInfo = {
    supportedFeatures: [
      'Types: char, bool, short, int, long, long long, unsigned, float, double, size_t (64-bit values exact)',
      'All operators, sizeof, casts; if/else, loops, switch, break/continue, block scopes',
      'Functions, recursion, references (&), pointers and pointer arithmetic',
      '1-D and 2-D arrays with initializer lists',
      'structs and classes: fields, member functions, constructors, destructors, this',
      'malloc/calloc/free and new/new[]/delete/delete[]',
      'printf/scanf, puts/putchar, std::cout/std::cin, std::string basics',
      'std::vector, std::stack, std::queue, std::swap, std::sort',
      'Stops on out-of-bounds, null dereference, use-after-free, double free, uninitialized reads, division by zero',
    ],
    unsupportedFeatures: [
      'User-defined templates, inheritance and virtual functions',
      'goto, unions, bit-fields, inline assembly, enums, exceptions',
      'Multiple files and headers other than the standard ones listed in the README',
    ],
    limitsDescription: 'Max 5,000 steps by default. Call stack depth limit 256. 8-second watchdog. Synthetic addresses.',
  };

  prepare(): Promise<void> {
    return Promise.resolve();
  }

  run(req: RunRequest, onProgress?: (stepCount: number) => void): Promise<RawTrace> {
    this.worker ??= new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
    const worker = this.worker;
    const id = ++this.requestId;
    const started = performance.now();

    return new Promise<RawTrace>((resolve, reject) => {
      const finish = () => {
        clearTimeout(watchdog);
        worker.removeEventListener('message', onMessage);
        this.rejectPending = null;
      };
      const onMessage = (e: MessageEvent) => {
        if (e.data.id !== id) return;
        if (e.data.type === 'progress') {
          onProgress?.(e.data.stepCount);
          return;
        }
        finish();
        if (e.data.type === 'crash') {
          reject(new Error(`The C/C++ interpreter crashed: ${e.data.message}`));
          return;
        }
        const rawTrace: RawTrace = { ...e.data.rawTrace, language: this.id };
        rawTrace.stats = { durationMs: Math.round(performance.now() - started) };
        resolve(rawTrace);
      };
      this.rejectPending = (err) => {
        finish();
        reject(err);
      };
      // A runaway program can't be interrupted from inside, so the worker is replaced.
      const watchdog = setTimeout(() => {
        finish();
        this.resetWorker();
        resolve({
          language: this.id,
          source: req.source,
          steps: [],
          stdout: '',
          status: 'error',
          error: {
            phase: 'limit',
            kind: 'WatchdogTimeout',
            line: 1,
            message: 'Execution exceeded the 8-second time budget.',
            title: 'Execution timed out',
            explanation: 'The program took longer than 8 seconds, so Tracel stopped it. Lower the step limit or check for very long loops.',
            context: [],
          },
          stats: { durationMs: HARD_TIMEOUT_MS },
        });
      }, HARD_TIMEOUT_MS);

      worker.addEventListener('message', onMessage);
      worker.postMessage({ type: 'run', id, source: req.source, stdin: req.stdin, stepLimit: req.stepLimit });
    });
  }

  cancel(): void {
    if (!this.worker) return;
    this.resetWorker();
    this.rejectPending?.(new RunCancelled());
  }

  private resetWorker() {
    this.worker?.terminate();
    this.worker = null;
  }
}

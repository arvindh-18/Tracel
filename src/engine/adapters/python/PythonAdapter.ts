import { LanguageAdapter, RunRequest, SupportInfo } from '../types';
import { RawTrace } from '../../../trace/normalize';
import { enhancePythonError } from './explain';

const HARD_TIMEOUT_MS = 8000;

export class PythonAdapter implements LanguageAdapter {
  id = 'python' as const;
  displayName = 'Python';
  engineLabel = 'CPython 3.12 (Pyodide)';
  fileExtension = '.py';

  private worker: Worker | null = null;
  private isReady = false;
  private pendingRequestId = 0;

  supportInfo: SupportInfo = {
    allowedImports: [
      'math',
      'random',
      'collections',
      'heapq',
      'bisect',
      'itertools',
      'functools',
      'operator',
      'string',
      're',
      'dataclasses',
      'typing',
      'enum',
      'copy',
      'statistics',
      'fractions',
      'decimal',
      'array',
      'time',
      'tracel',
    ],
    supportedFeatures: [
      'Variables, arithmetic, conditionals, loops',
      'Functions, recursion, multiple return values',
      'Lists, tuples, dictionaries, sets',
      'Classes, custom objects, __init__',
      'Helper module tracel.Stack and tracel.Queue',
      'Standard input via input()',
      'In-memory stdout via print()',
    ],
    unsupportedFeatures: [
      'Operating system access (os, subprocess)',
      'Network sockets and HTTP requests',
      'File system access (open)',
      'Multi-threading / multiprocessing / async',
    ],
    limitsDescription:
      'Max 5,000 execution steps. 8-second hard execution watchdog. Memory cap 64MB.',
  };

  private ensureWorker(): Worker {
    if (!this.worker) {
      this.worker = new Worker(
        new URL('./worker.ts', import.meta.url),
        { type: 'module' }
      );
    }
    return this.worker;
  }

  async prepare(): Promise<void> {
    if (this.isReady) return;
    const worker = this.ensureWorker();

    return new Promise((resolve) => {
      const handler = (e: MessageEvent) => {
        if (e.data.type === 'ready' || e.data.type === 'status') {
          if (e.data.type === 'ready') {
            this.isReady = true;
            worker.removeEventListener('message', handler);
            resolve();
          }
        }
      };
      worker.addEventListener('message', handler);
      worker.postMessage({ type: 'init' });
    });
  }

  async run(
    req: RunRequest,
    onProgress?: (stepCount: number) => void
  ): Promise<RawTrace> {
    const worker = this.ensureWorker();
    const reqId = ++this.pendingRequestId;
    const startTime = performance.now();

    return new Promise<RawTrace>((resolve) => {
      let timeoutId: number | null = null;

      const cleanup = () => {
        if (timeoutId !== null) clearTimeout(timeoutId);
        worker.removeEventListener('message', messageHandler);
      };

      const messageHandler = (e: MessageEvent) => {
        const data = e.data;
        if (data.id !== reqId) return;

        if (data.type === 'progress' && onProgress) {
          onProgress(data.stepCount);
        } else if (data.type === 'result') {
          cleanup();
          const rawTrace: RawTrace = data.rawTrace;
          rawTrace.stats = { durationMs: Math.round(performance.now() - startTime) };
          if (rawTrace.error) {
            rawTrace.error = enhancePythonError(rawTrace.error);
          }
          resolve(rawTrace);
        }
      };

      // Watchdog timeout to prevent freezes (e.g. 10**10**10)
      timeoutId = window.setTimeout(() => {
        cleanup();
        // Terminate hanging worker and spawn fresh one
        worker.terminate();
        this.worker = null;
        this.isReady = false;

        const timeoutTrace: RawTrace = {
          language: 'python',
          source: req.source,
          steps: [],
          stdout: '',
          status: 'error',
          error: {
            phase: 'limit',
            kind: 'WatchdogTimeout',
            line: 1,
            message: 'Worker execution exceeded 8-second time budget.',
            title: 'Execution Timed Out',
            explanation:
              'The program took too long to complete (exceeded 8 seconds). Worker was safely terminated and reset.',
            context: [],
          },
          stats: { durationMs: HARD_TIMEOUT_MS },
        };
        resolve(timeoutTrace);
      }, HARD_TIMEOUT_MS);

      worker.addEventListener('message', messageHandler);
      worker.postMessage({
        type: 'run',
        id: reqId,
        source: req.source,
        stdin: req.stdin,
        stepLimit: req.stepLimit,
      });
    });
  }
}


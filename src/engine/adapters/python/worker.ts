import { PYTHON_TRACER_CODE } from './pyRunner';

/* eslint-disable no-restricted-globals */
declare const self: any;
declare function importScripts(...urls: string[]): void;
declare function loadPyodide(options?: any): Promise<any>;

let pyodideInstance: any = null;
let isInitializing = false;

async function getPyodide(): Promise<any> {
  if (pyodideInstance) return pyodideInstance;
  if (isInitializing) {
    while (isInitializing) {
      await new Promise((r) => setTimeout(r, 50));
    }
    return pyodideInstance;
  }

  isInitializing = true;
  self.postMessage({ type: 'status', message: 'Loading Pyodide runtime…' });

  importScripts('https://cdn.jsdelivr.net/pyodide/v0.26.4/full/pyodide.js');
  pyodideInstance = await loadPyodide({
    indexURL: 'https://cdn.jsdelivr.net/pyodide/v0.26.4/full/',
  });

  // Run initial tracer module setup
  await pyodideInstance.runPythonAsync(PYTHON_TRACER_CODE);
  isInitializing = false;
  self.postMessage({ type: 'status', message: 'Pyodide ready' });

  return pyodideInstance;
}

self.onmessage = async (e: MessageEvent) => {
  const { type, id, source, stdin, stepLimit } = e.data;

  if (type === 'init') {
    try {
      await getPyodide();
      self.postMessage({ type: 'ready' });
    } catch (err: any) {
      self.postMessage({ type: 'error', error: err.message });
    }
    return;
  }

  if (type === 'run') {
    try {
      const py = await getPyodide();

      // Pass source and options safely to runner
      const pySourceEscaped = JSON.stringify(source);
      const pyStdinEscaped = JSON.stringify(stdin || '');
      const pyLimit = stepLimit || 5000;

      const runPyScript = `run_tracel(${pySourceEscaped}, ${pyStdinEscaped}, ${pyLimit})`;
      const jsonResult = await py.runPythonAsync(runPyScript);
      const parsed = JSON.parse(jsonResult);

      const rawTrace = {
        language: 'python' as const,
        source,
        steps: parsed.steps,
        stdout: parsed.stdout,
        status: parsed.status,
        error: parsed.error,
        stats: { durationMs: 0 },
      };

      self.postMessage({ type: 'result', id, rawTrace });
    } catch (err: any) {
      self.postMessage({
        type: 'result',
        id,
        rawTrace: {
          language: 'python' as const,
          source,
          steps: [],
          stdout: '',
          status: 'error' as const,
          error: {
            phase: 'runtime' as const,
            kind: 'PyodideError',
            line: 1,
            message: err.message || 'Worker execution failed',
            title: 'Runtime Error',
            explanation: err.message || 'Failed to execute Python in worker',
            context: [],
          },
        },
      });
    }
  }
};

// Runs the C/C++ interpreter off the main thread, so a long program never freezes the page.
import { runClikeInterpreter } from './interpreter';

/* eslint-disable no-restricted-globals */
declare const self: { postMessage(msg: unknown): void; onmessage: ((e: MessageEvent) => void) | null };

self.onmessage = (e: MessageEvent) => {
  const { type, id, source, stdin, stepLimit } = e.data;
  if (type !== 'run') return;
  try {
    const rawTrace = runClikeInterpreter(source, {
      stdin,
      stepLimit,
      onProgress: (stepCount) => self.postMessage({ type: 'progress', id, stepCount }),
    });
    self.postMessage({ type: 'result', id, rawTrace });
  } catch (err) {
    self.postMessage({ type: 'crash', id, message: err instanceof Error ? err.message : String(err) });
  }
};

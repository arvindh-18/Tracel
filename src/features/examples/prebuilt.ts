import { Trace } from '../../trace/schema';
import { EXAMPLES } from './registry';

// Built-in examples ship with traces generated at build time (npm run
// gen:examples), so opening one needs no engine and no network beyond a small
// JSON file. Editing the code falls back to a live run.

/** Bump when the trace format changes; older files are then ignored. */
export const PREBUILT_FORMAT = 2;

export interface PrebuiltExample {
  format: number;
  id: string;
  language: 'python' | 'c' | 'cpp';
  source: string;
  trace: Trace;
}

const loaded = new Map<string, Promise<Trace | null>>();

/** The example whose code is exactly `source`, if any. */
export function matchExample(language: string, source: string) {
  return EXAMPLES.find((e) => e.language === language && e.code === source);
}

/** The prebuilt trace for an unchanged example (with empty stdin), or null. */
export function loadPrebuilt(language: string, source: string, stdin: string): Promise<Trace | null> {
  const ex = matchExample(language, source);
  if (!ex || stdin.trim()) return Promise.resolve(null);
  if (!loaded.has(ex.id)) {
    const url = `${import.meta.env.BASE_URL}examples/${ex.id}.json`;
    loaded.set(
      ex.id,
      fetch(url)
        .then((r) => (r.ok ? (r.json() as Promise<PrebuiltExample>) : null))
        .then((file) => (file && file.format === PREBUILT_FORMAT && file.source === source ? file.trace : null))
        .catch(() => null)
    );
  }
  return loaded.get(ex.id)!;
}

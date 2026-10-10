// Pre-generates a trace for every built-in example so first-time visitors see
// them instantly, with no engine to load and no API call.
//
//   npm run gen:examples                      real engines only
//   GEMINI_API_KEY=... npm run gen:examples   also adds AI explanations
//
// C/C++ run on the interpreter directly; Python runs the same tracer in
// Pyodide for Node (the npm package matching the CDN version the site uses).
import { mkdirSync, readdirSync, rmSync, writeFileSync } from 'fs';
import path from 'path';
import { createRequire } from 'module';
import { EXAMPLES } from '../src/features/examples/registry';
import { runClikeInterpreter } from '../src/engine/adapters/clike/interpreter';
import { PYTHON_TRACER_CODE } from '../src/engine/adapters/python/pyRunner';
import { enhancePythonError } from '../src/engine/adapters/python/explain';
import { normalize, RawTrace } from '../src/trace/normalize';
import { explain } from '../src/engine/adapters/ai/client';
import { mergeExplanation, traceDigest } from '../src/engine/adapters/ai/explainMerge';
import { PREBUILT_FORMAT, PrebuiltExample } from '../src/features/examples/prebuilt';

const STEP_LIMIT = 5000;
const outDir = path.resolve('public/examples');

async function pythonRunner() {
  const require = createRequire(import.meta.url);
  const { loadPyodide } = await import('pyodide');
  const pyodide = await loadPyodide({ indexURL: path.dirname(require.resolve('pyodide/package.json')) });
  await pyodide.runPythonAsync(PYTHON_TRACER_CODE);
  return async (source: string): Promise<RawTrace> => {
    const json = await pyodide.runPythonAsync(`run_tracel(${JSON.stringify(source)}, "", ${STEP_LIMIT})`);
    const parsed = JSON.parse(json);
    const raw: RawTrace = { language: 'python', source, steps: parsed.steps, stdout: parsed.stdout, status: parsed.status, error: parsed.error ?? undefined, recordedBefore: true };
    if (raw.error) raw.error = enhancePythonError(raw.error);
    return raw;
  };
}

async function main() {
  const apiKey = process.env.GEMINI_API_KEY;
  mkdirSync(outDir, { recursive: true });
  for (const f of readdirSync(outDir)) if (f.endsWith('.json')) rmSync(path.join(outDir, f));

  const runPython = EXAMPLES.some((e) => e.language === 'python') ? await pythonRunner() : null;
  for (const ex of EXAMPLES) {
    const raw = ex.language === 'python' ? await runPython!(ex.code) : { ...runClikeInterpreter(ex.code, { stepLimit: STEP_LIMIT }), language: ex.language };
    let trace = normalize(raw);
    trace.stats.durationMs = 0;
    if (apiKey) {
      const digest = traceDigest(trace);
      if (digest) {
        try {
          trace = mergeExplanation(trace, await explain({ language: ex.language, source: ex.code, digest, error: trace.error?.message, apiKey }));
        } catch (err) {
          console.warn(`  ${ex.id}: AI explanation skipped (${(err as Error).message})`);
        }
      }
    }
    const file: PrebuiltExample = { format: PREBUILT_FORMAT, id: ex.id, language: ex.language, source: ex.code, trace };
    writeFileSync(path.join(outDir, `${ex.id}.json`), JSON.stringify(file));
    console.log(`${ex.id}: ${trace.status}, ${trace.steps.length} steps${trace.aiExplained ? ', explained' : ''}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

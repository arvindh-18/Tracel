import { Trace, ViewState, StepIndex, HeapObject } from './schema';

const cache = new Map<string, ViewState>();
const MAX_CACHE_SIZE = 128;

function makeKey(traceHash: string, index: number): string {
  return `${traceHash}:${index}`;
}

/**
 * Reconstructs ViewState for a given step in O(size of state).
 * Structural sharing in heapVersions ensures low memory overhead.
 */
export function stateAt(trace: Trace, stepIndex: StepIndex): ViewState {
  if (!trace.steps || trace.steps.length === 0) {
    return {
      step: {
        index: 0,
        line: 1,
        kind: 'line',
        frames: [],
        heap: {},
        stdoutLength: 0,
        events: [],
        narration: '',
      },
      frames: [],
      heap: {},
      output: '',
      events: [],
    };
  }

  const boundedIndex = Math.max(0, Math.min(stepIndex, trace.steps.length - 1));
  const cacheKey = makeKey(trace.sourceHash, boundedIndex);
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  const step = trace.steps[boundedIndex];
  if (!step) {
    throw new Error(`Step ${boundedIndex} not found in trace`);
  }

  const heap: Record<string, HeapObject> = {};
  for (const [id, version] of Object.entries(step.heap)) {
    const versions = trace.heapVersions[id];
    if (versions && versions[version]) {
      heap[id] = versions[version]!;
    }
  }

  const output = trace.stdout.slice(0, step.stdoutLength);

  const viewState: ViewState = {
    step,
    frames: step.frames,
    heap,
    output,
    events: step.events,
  };

  if (cache.size >= MAX_CACHE_SIZE) {
    const firstKey = cache.keys().next().value;
    if (firstKey) cache.delete(firstKey);
  }
  cache.set(cacheKey, viewState);

  return viewState;
}

export function clearStateCache() {
  cache.clear();
}


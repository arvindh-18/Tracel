import {
  LensKind,
  Frame,
  HeapId,
  HeapObject,
  Step,
  Trace,
  TraceError,
  TraceEvent,
  Value,
} from './schema';
import { diffFrames, diffHeapObject } from './diff';
import { narrate } from './narrate';
import { parsePragmaAnnotations, inferLensKind } from './lens-infer';

export interface RawStep {
  line: number;
  kind?: 'line' | 'call' | 'return' | 'exception' | 'end' | 'limit';
  range?: { from: number; to: number };
  frames: Frame[];
  heap: Record<HeapId, Omit<HeapObject, 'version'>>;
  stdoutLength?: number;
  stdoutDelta?: string;
  error?: TraceError;
  explicitEvents?: TraceEvent[];
}

export interface RawTrace {
  language: 'python' | 'c' | 'cpp';
  source: string;
  steps: RawStep[];
  stdout: string;
  status: 'completed' | 'error' | 'limit';
  error?: TraceError;
  stats?: { durationMs?: number };
  /** Set when an AI model produced the trace instead of a real interpreter. */
  engine?: 'ai';
  /** The engine recorded each step just before its line ran (the Python tracer and the C/C++ interpreter). */
  recordedBefore?: boolean;
  aiNarrations?: (string | undefined)[];
  aiLensHints?: Record<string, LensKind>;
}

function hashString(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash).toString(36);
}

function heapObjectsEqual(
  a: Omit<HeapObject, 'version'>,
  b: Omit<HeapObject, 'version'>
): boolean {
  if (a.kind !== b.kind || a.typeName !== b.typeName) return false;
  if (a.freed !== b.freed) return false;

  const aItems = a.items ?? [];
  const bItems = b.items ?? [];
  if (aItems.length !== bItems.length) return false;
  for (let i = 0; i < aItems.length; i++) {
    if (JSON.stringify(aItems[i]) !== JSON.stringify(bItems[i])) return false;
  }

  // dict / map entries
  if (JSON.stringify(a.entries ?? []) !== JSON.stringify(b.entries ?? [])) return false;

  const aFields = a.fields ?? [];
  const bFields = b.fields ?? [];
  if (aFields.length !== bFields.length) return false;
  for (let i = 0; i < aFields.length; i++) {
    if (
      aFields[i]?.[0] !== bFields[i]?.[0] ||
      JSON.stringify(aFields[i]?.[1]) !== JSON.stringify(bFields[i]?.[1])
    ) {
      return false;
    }
  }

  return true;
}

/**
 * Engines record a step just before its line runs. For display, a step should
 * show what its line did, so each step takes the state recorded at the next
 * one: while line L is highlighted, line L's effect is on screen. The step
 * keeps its own line, kind, range, error and line-level events (branch taken,
 * loop iteration). The last step and exception steps keep their own state.
 */
export function showEffectsOnLine(steps: RawStep[]): RawStep[] {
  return steps.map((step, i) => {
    const next = steps[i + 1];
    // Return steps show the function's frame with its return value, so they keep their own state.
    if (!next || step.kind === 'exception' || step.kind === 'return' || step.error) return step;
    return {
      ...next,
      line: step.line,
      kind: step.kind,
      range: step.range,
      error: undefined,
      explicitEvents: step.explicitEvents,
      // The running frame is still on this line.
      frames: next.frames.map((f, idx) => (idx === next.frames.length - 1 && next.frames.length === step.frames.length ? { ...f, line: step.line } : f)),
    };
  });
}

export function normalize(input: RawTrace): Trace {
  const raw: RawTrace = input.recordedBefore ? { ...input, steps: showEffectsOnLine(input.steps) } : input;
  const heapVersions: Record<HeapId, HeapObject[]> = {};
  const currentVersions: Record<HeapId, number> = {};
  const steps: Step[] = [];
  const pragmas = parsePragmaAnnotations(raw.source);
  const lensHints: Record<HeapId, any> = {};

  let accumulatedStdoutLength = 0;
  let maxDepth = 0;

  for (let i = 0; i < raw.steps.length; i++) {
    const rawStep = raw.steps[i]!;
    if (rawStep.frames.length > maxDepth) {
      maxDepth = rawStep.frames.length;
    }

    // Process heap for this step
    const stepHeapVersions: Record<HeapId, number> = {};

    for (const [id, rawObj] of Object.entries(rawStep.heap)) {
      if (!heapVersions[id]) {
        heapVersions[id] = [];
      }

      const versions = heapVersions[id]!;
      const currentVer = currentVersions[id];

      if (currentVer !== undefined && versions[currentVer]) {
        const lastObj = versions[currentVer]!;
        if (heapObjectsEqual(lastObj, rawObj)) {
          stepHeapVersions[id] = currentVer;
          continue;
        }
      }

      // Object is new or mutated
      const nextVer = versions.length;
      const versionedObj: HeapObject = {
        ...rawObj,
        version: nextVer,
      };
      versions.push(versionedObj);
      currentVersions[id] = nextVer;
      stepHeapVersions[id] = nextVer;

      // Infer lens for this object. A struct first seen with unset pointer fields
      // looks like a plain object; look again once it changes (e.g. next is set).
      if (!lensHints[id] || lensHints[id] === 'object') {
        // Find if any local refers to it
        let refVarName: string | undefined;
        for (const frame of rawStep.frames) {
          for (const [name, val] of frame.locals) {
            if (val.k === 'ref' && val.id === id) {
              refVarName = name;
              break;
            }
          }
          if (refVarName) break;
        }
        lensHints[id] = inferLensKind(versionedObj, refVarName, pragmas, undefined, (hid) => rawStep.heap[hid]);
      }
    }

    if (rawStep.stdoutDelta) {
      accumulatedStdoutLength += rawStep.stdoutDelta.length;
    } else if (rawStep.stdoutLength !== undefined) {
      accumulatedStdoutLength = rawStep.stdoutLength;
    }

    // Diff events from previous step
    const events: TraceEvent[] = [...(rawStep.explicitEvents ?? [])];
    const prevRawStep = i > 0 ? raw.steps[i - 1] : undefined;

    if (prevRawStep) {
      // Diff frames
      const frameEvents = diffFrames(prevRawStep.frames, rawStep.frames);
      events.push(...frameEvents);

      // Diff all heap objects in either step
      const allHeapIds = new Set([
        ...Object.keys(prevRawStep.heap),
        ...Object.keys(rawStep.heap),
      ]);

      for (const hid of allHeapIds) {
        const prevObj = prevRawStep.heap[hid];
        const nextObj = rawStep.heap[hid];
        if (prevObj && nextObj) {
          const prevVersioned: HeapObject = { ...prevObj, version: 0 };
          const nextVersioned: HeapObject = { ...nextObj, version: 1 };
          const heapEvents = diffHeapObject(prevVersioned, nextVersioned);
          events.push(...heapEvents);
        } else if (!prevObj && nextObj) {
          events.push({ type: 'obj_create', id: hid });
        } else if (prevObj && !nextObj) {
          events.push({ type: 'obj_free', id: hid });
        }
      }
    } else {
      // Step 0: initial creations
      for (const frame of rawStep.frames) {
        for (const [name, val] of frame.locals) {
          events.push({
            type: 'var_create',
            frame: frame.id,
            name,
            value: val,
          });
        }
      }
    }

    if (rawStep.stdoutDelta) {
      events.push({ type: 'output', text: rawStep.stdoutDelta });
    }

    if (rawStep.error) {
      events.push({ type: 'error', error: rawStep.error });
    }

    const step: Step = {
      index: i,
      line: rawStep.line,
      range: rawStep.range,
      kind: rawStep.kind ?? (rawStep.error ? 'exception' : 'line'),
      frames: rawStep.frames,
      heap: stepHeapVersions,
      stdoutLength: accumulatedStdoutLength,
      events,
      narration: '',
    };

    // Generate narration
    step.narration = narrate(step, steps[i - 1]);
    steps.push(step);
  }

  return {
    language: raw.language,
    source: raw.source,
    sourceHash: hashString(raw.source),
    steps,
    heapVersions,
    stdout: raw.stdout,
    status: raw.status,
    error: raw.error,
    stats: {
      steps: steps.length,
      maxDepth,
      durationMs: raw.stats?.durationMs ?? 0,
    },
    lensHints,
    engine: raw.engine === 'ai' ? 'ai' : 'native',
  };
}


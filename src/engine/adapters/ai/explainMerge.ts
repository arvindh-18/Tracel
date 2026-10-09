import { HeapId, LensKind, Trace, Value } from '../../../trace/schema';
import { ExplainResult } from './schema';

// The explain pass never changes state: it only replaces narration (when the
// step counts match), adds lens hints and rewrites the error explanation.

export const MAX_DIGEST_STEPS = 400;

function short(v: Value): string {
  switch (v.k) {
    case 'int':
    case 'float':
      return String(v.v);
    case 'bool':
      return String(v.v);
    case 'str':
      return JSON.stringify(v.v.length > 30 ? v.v.slice(0, 27) + '...' : v.v);
    case 'char':
      return `'${String.fromCharCode(v.v)}'`;
    case 'none':
      return 'null';
    case 'uninit':
      return '?';
    case 'fn':
      return `fn ${v.name}`;
    case 'ptr':
      return v.id ? `→${v.id}[${v.offset}]` : 'nullptr';
    default:
      return `@${v.id}`;
  }
}

/** One line per step: line number plus what changed. Null when the trace is too long to explain. */
export function traceDigest(trace: Trace): string[] | null {
  if (trace.steps.length === 0 || trace.steps.length > MAX_DIGEST_STEPS) return null;
  return trace.steps.map((step, i) => {
    const parts: string[] = [];
    for (const ev of step.events) {
      switch (ev.type) {
        case 'var_create':
          parts.push(`${ev.name}=${short(ev.value)}`);
          break;
        case 'var_update':
          parts.push(`${ev.name}:${short(ev.from)}→${short(ev.to)}`);
          break;
        case 'call':
          parts.push(`call ${ev.name}(${ev.args.map(([n, v]) => `${n}=${short(v)}`).join(', ')})`);
          break;
        case 'return':
          parts.push(`return${ev.value ? ' ' + short(ev.value) : ''}`);
          break;
        case 'item_set':
          parts.push(`${ev.id}[${ev.index}]=${short(ev.to)}`);
          break;
        case 'item_insert':
          parts.push(`${ev.op ?? 'insert'} ${short(ev.value)} into ${ev.id}`);
          break;
        case 'item_remove':
          parts.push(`${ev.op ?? 'remove'} ${short(ev.value)} from ${ev.id}`);
          break;
        case 'field_set':
          parts.push(`${ev.id}.${ev.field}=${short(ev.to)}`);
          break;
        case 'output':
          parts.push(`print ${JSON.stringify(ev.text)}`);
          break;
        case 'error':
          parts.push(`error ${ev.error.kind}`);
          break;
      }
    }
    return `${i + 1}. L${step.line}${parts.length ? ': ' + parts.join('; ').slice(0, 300) : ''}`;
  });
}

/** Resolves variable-name lens hints to the heap ids those variables point at. */
export function lensHintsById(trace: Trace, byName: Record<string, LensKind>): Record<HeapId, LensKind> {
  const out: Record<HeapId, LensKind> = {};
  for (const step of trace.steps) {
    for (const frame of step.frames) {
      for (const [name, v] of frame.locals) {
        const lens = byName[name];
        if (lens && (v.k === 'ref' || v.k === 'ptr' || v.k === 'inline') && v.id && !out[v.id]) out[v.id] = lens;
      }
    }
  }
  return out;
}

/** Narrations replace the built-in ones only when there is exactly one per step. */
export function applyNarrations(trace: Trace, narrations: (string | undefined)[]): boolean {
  if (narrations.length !== trace.steps.length) return false;
  trace.steps.forEach((step, i) => {
    const text = narrations[i]?.trim();
    if (text) step.narration = text.length > 100 ? text.slice(0, 97) + '...' : text;
  });
  return true;
}

export function mergeExplanation(trace: Trace, result: ExplainResult): Trace {
  const merged: Trace = {
    ...trace,
    steps: trace.steps.map((s) => ({ ...s })),
    lensHints: { ...trace.lensHints },
    aiExplained: true,
  };
  const applied = applyNarrations(merged, result.narrations);
  if (result.lensHints?.length) {
    const byName = Object.fromEntries(result.lensHints.map((h) => [h.name, h.lens]));
    Object.assign(merged.lensHints, lensHintsById(merged, byName));
  }
  if (result.errorExplanation && merged.error) {
    merged.error = { ...merged.error, explanation: result.errorExplanation };
  }
  if (!applied) merged.aiNotice = 'AI narration skipped: it did not match the trace step for step.';
  return merged;
}

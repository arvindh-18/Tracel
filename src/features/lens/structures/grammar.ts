import { Frame, HeapId, Trace, TraceEvent, Value } from '../../../trace/schema';
import { useSessionStore } from '../../../store/session';
import { usePlaybackStore } from '../../../store/playback';

// Names that conventionally index into a sequence. Restricting cursors to
// these keeps unrelated integers (sum, count, x) from posing as pointers.
const INDEX_NAMES = /^(i|j|k|l|r|lo|hi|mid|left|right|idx|index|start|end|pos|p|q|front|rear|head|tail|top)$/;

const NOT_VARIABLES = new Set(['int', 'len', 'size', 'sizeof', 'true', 'false', 'None', 'True', 'False', 'and', 'or', 'not', 'nullptr', 'NULL']);
const subscriptCache = new Map<string, Set<string>>();

/**
 * Variables the program uses inside a subscript (arr[pos], grid[r][c], a[n - 1 - k]),
 * read from the source. Any integer among them is treated as an index into the
 * array it shows, whatever its name.
 */
export function subscriptNames(source: string | undefined): Set<string> {
  if (!source) return new Set();
  let names = subscriptCache.get(source);
  if (!names) {
    names = new Set();
    const code = source.replace(/\/\/.*$|#.*$/gm, '').replace(/"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/g, '""');
    for (const m of code.matchAll(/(?<=[\w\])])\s*\[([^\[\]]+)\]/g)) {
      for (const id of m[1]!.match(/[A-Za-z_]\w*/g) ?? []) if (!NOT_VARIABLES.has(id)) names.add(id);
    }
    if (subscriptCache.size > 20) subscriptCache.clear();
    subscriptCache.set(source, names);
  }
  return names;
}

export interface Cursor {
  name: string;
  index: number;
}

/**
 * Integer locals of the running (innermost) frame that index into a sequence of `length`,
 * plus pointers in any frame that point at an element of `id`.
 */
export function indexCursors(frames: Frame[], length: number, id?: HeapId, usedAsIndex?: Set<string>): Cursor[] {
  const frame = frames[frames.length - 1];
  if (!frame) return [];
  const cursors: Cursor[] = [];
  for (const [name, v] of frame.locals) {
    if (v.k !== 'int' || !(INDEX_NAMES.test(name) || usedAsIndex?.has(name))) continue;
    const index = Number(v.v);
    if (Number.isInteger(index) && index >= 0 && index < length) cursors.push({ name, index });
  }
  if (id) {
    for (let f = frames.length - 1; f >= 0; f--) {
      for (const [name, v] of frames[f]!.locals) {
        if (v.k === 'ptr' && v.id === id && v.offset >= 0 && v.offset < length && !cursors.some((c) => c.name === name)) {
          cursors.push({ name, index: v.offset });
        }
      }
    }
  }
  return cursors;
}

/** Locals (any frame) whose pointer or reference targets `id`, innermost frame first. */
export function pointersTo(frames: Frame[], id: HeapId): string[] {
  const names: string[] = [];
  for (let f = frames.length - 1; f >= 0; f--) {
    for (const [name, v] of frames[f]!.locals) {
      if ((v.k === 'ref' || v.k === 'ptr') && v.id === id && !names.includes(name)) names.push(name);
    }
  }
  return names;
}

/** The trace and current step, for views that need history rather than one snapshot. */
export function useHistory(): { trace: Trace | null; at: number } {
  const trace = useSessionStore((s) => s.trace);
  const at = usePlaybackStore((s) => s.currentStepIndex);
  return { trace, at };
}

/** Indices a cursor pointed at in earlier steps of the same run: the lit path. */
export function visitedIndices(trace: Trace | null, at: number, length: number, id?: HeapId): Set<number> {
  const seen = new Set<number>();
  if (!trace) return seen;
  const usedAsIndex = subscriptNames(trace.source);
  for (let s = Math.max(0, at - 2000); s < at; s++) {
    for (const c of indexCursors(trace.steps[s]!.frames, length, id, usedAsIndex)) seen.add(c.index);
  }
  return seen;
}

/** Heap ids that some local other than `exclude` pointed at in earlier steps. */
export function visitedNodes(trace: Trace | null, at: number, exclude: string[]): Set<HeapId> {
  const seen = new Set<HeapId>();
  if (!trace) return seen;
  for (let s = Math.max(0, at - 2000); s < at; s++) {
    for (const frame of trace.steps[s]!.frames) {
      for (const [name, v] of frame.locals) {
        if ((v.k === 'ref' || v.k === 'ptr') && v.id && !exclude.includes(name)) seen.add(v.id);
      }
    }
  }
  return seen;
}

/** How many items have left the front of `id` up to and including step `at`. Gives queue items stable keys. */
export function frontRemovals(trace: Trace | null, at: number, id: HeapId): number {
  if (!trace) return 0;
  let n = 0;
  for (let s = 0; s <= at && s < trace.steps.length; s++) {
    for (const ev of trace.steps[s]!.events) {
      if (ev.type === 'item_remove' && ev.id === id && ev.index === 0) n++;
    }
  }
  return n;
}

export function formatValue(v: Value): string {
  switch (v.k) {
    case 'int':
    case 'float':
      return String(v.v);
    case 'bool':
      return v.v ? 'True' : 'False';
    case 'str':
      return JSON.stringify(v.v);
    case 'char':
      return `'${String.fromCharCode(v.v)}'`;
    case 'none':
      return 'None';
    case 'uninit':
      return '?';
    case 'fn':
      return v.name;
    case 'ptr':
      return v.id ? v.address : 'nullptr';
    default:
      return v.id;
  }
}

/** A short monospace caption for what happened to `id` on this step, or null. */
export function caption(events: TraceEvent[], id: HeapId): string | null {
  for (const ev of events) {
    if (!('id' in ev) || ev.id !== id) continue;
    switch (ev.type) {
      case 'item_insert':
        return `${ev.op ?? 'insert'} ${formatValue(ev.value)}`;
      case 'item_remove':
        return `${ev.op ?? 'remove'} → ${formatValue(ev.value)}`;
      case 'item_set':
        return `[${ev.index}] = ${formatValue(ev.to)}`;
      case 'item_swap':
        return `swap [${ev.i}] [${ev.j}]`;
      case 'entry_set':
        return `${ev.from ? 'update' : 'insert'} ${formatValue(ev.key)}`;
      case 'entry_delete':
        return `delete ${formatValue(ev.key)}`;
      case 'field_set':
        return `.${ev.field} = ${formatValue(ev.to)}`;
      case 'obj_free':
        return 'freed';
    }
  }
  return null;
}

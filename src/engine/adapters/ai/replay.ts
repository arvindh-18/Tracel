import { RawStep, RawTrace } from '../../../trace/normalize';
import { Frame, HeapKind, HeapObject, LensKind, TraceError, Value } from '../../../trace/schema';
import { AiOp, AiValue, SimulateResult } from './schema';

// Replays the operations an AI model emitted for a C/C++ program into a
// RawTrace with a full snapshot per step. The model only describes effects;
// all state lives here, every operation is checked, and nothing is invented.
// A step's snapshot shows the state after that step's operations ran.

interface Block {
  id: string;
  kind: 'array' | 'struct' | 'vector' | 'stack' | 'queue';
  elemType: string;
  region: 'stack' | 'heap';
  items: Value[];
  fields: [string, Value][];
  freed: boolean;
  address: number;
}

interface FrameState {
  id: string;
  name: string;
  line: number;
  locals: Map<string, Value>;
  returnValue?: Value;
}

const ERROR_TITLES: Record<string, string> = {
  OutOfBounds: 'Index out of bounds',
  NullDereference: 'Null pointer dereference',
  UseAfterFree: 'Use after free',
  DoubleFree: 'Double free',
  UninitializedRead: 'Uninitialized variable',
  DivisionByZero: 'Division by zero',
  EmptyContainer: 'Empty container',
  StepLimit: 'Execution stopped (step limit)',
};

const HEAP_KIND: Record<Block['kind'], HeapKind> = {
  array: 'array',
  struct: 'struct',
  vector: 'vector',
  stack: 'cpp_stack',
  queue: 'cpp_queue',
};

function sizeOf(type: string): number {
  if (type.endsWith('*')) return 8;
  if (/^(char|bool)$/.test(type)) return 1;
  if (/^(double|long|long long|size_t)$/.test(type)) return 8;
  return 4;
}

/** A replay failure: the program's own error (kind from the trace) or an impossible operation. */
class Stop extends Error {
  constructor(
    public kind: string,
    message: string,
    public invalid: boolean
  ) {
    super(message);
  }
}

export interface ReplayResult {
  rawTrace: RawTrace;
  /** Variable-name lens hints from the model, resolved later against heap ids. */
  lensHints: Record<string, LensKind>;
  narrations: (string | undefined)[];
}

export function replay(
  result: SimulateResult,
  opts: { language: 'c' | 'cpp'; source: string; stdin?: string; stepLimit: number }
): ReplayResult {
  const lineCount = opts.source.split('\n').length;
  const frames: FrameState[] = [];
  const blocks = new Map<string, Block>();
  const steps: RawStep[] = [];
  const narrations: (string | undefined)[] = [];
  let stdout = '';
  let nextStack = 0x7ffe_c000;
  let nextHeap = 0x5580_0000;

  const top = (): FrameState => {
    const f = frames[frames.length - 1];
    if (!f) throw new Stop('InvalidTrace', 'An operation ran outside any function; the first step should call main.', true);
    return f;
  };

  const findVar = (name: string): FrameState | undefined => {
    for (let i = frames.length - 1; i >= 0; i--) if (frames[i]!.locals.has(name)) return frames[i];
    return undefined;
  };

  /** The block an id names; "&x" (or a bare name that is not a block) means variable x. */
  const target = (id: string): { block: Block } | { varName: string; frame: FrameState } => {
    const block = blocks.get(id);
    if (block) return { block };
    const name = id.startsWith('&') ? id.slice(1) : id;
    const frame = findVar(name);
    if (frame) return { varName: name, frame };
    throw new Stop('InvalidTrace', `Unknown block or variable '${id}'.`, true);
  };

  const toValue = (v: AiValue): Value => {
    switch (v.k) {
      case 'int': {
        const n = Number(v.v);
        if (v.v === undefined || !Number.isFinite(n)) throw new Stop('InvalidTrace', `Invalid int value '${v.v}'.`, true);
        return { k: 'int', v: String(Math.trunc(n)) };
      }
      case 'float': {
        const n = Number(v.v);
        if (v.v === undefined || Number.isNaN(n)) throw new Stop('InvalidTrace', `Invalid float value '${v.v}'.`, true);
        return { k: 'float', v: n };
      }
      case 'bool':
        return { k: 'bool', v: v.v === 'true' || v.v === '1' };
      case 'str':
        return { k: 'str', v: v.v ?? '' };
      case 'char':
        return { k: 'char', v: (v.v ?? '\0').charCodeAt(0) || 0 };
      case 'none':
        return { k: 'none' };
      case 'uninit':
        return { k: 'uninit', t: v.t ?? 'int' };
      case 'ref': {
        if (!v.id || !blocks.has(v.id)) throw new Stop('InvalidTrace', `Reference to unknown block '${v.id}'.`, true);
        return { k: 'ref', id: v.id };
      }
      case 'ptr': {
        const t = v.t ?? 'int';
        const offset = v.offset ?? 0;
        if (!v.id) return { k: 'ptr', id: null, offset: 0, t, address: '0x0' };
        const tgt = target(v.id);
        if ('block' in tgt) {
          return { k: 'ptr', id: tgt.block.id, offset, t, address: hex(tgt.block.address + offset * sizeOf(t)) };
        }
        // Pointer to a plain variable: the id names the variable, so it reads "→ x".
        return { k: 'ptr', id: tgt.varName, offset: 0, t, address: hex(varAddress(tgt.frame, tgt.varName)) };
      }
    }
  };

  const varAddress = (frame: FrameState, name: string): number => {
    const depth = frames.indexOf(frame);
    const index = [...frame.locals.keys()].indexOf(name);
    return 0x7fff_f000 - depth * 0x100 - index * 8;
  };

  const liveBlock = (id: string | undefined, what: string): Block => {
    if (!id) throw new Stop('InvalidTrace', `${what} needs a block id.`, true);
    const b = blocks.get(id);
    if (!b) throw new Stop('InvalidTrace', `${what} refers to unknown block '${id}'.`, true);
    if (b.freed) throw new Stop('UseAfterFree', `Block '${id}' was already freed.`, false);
    return b;
  };

  const need = <T>(value: T | undefined, what: string): T => {
    if (value === undefined) throw new Stop('InvalidTrace', `Missing ${what}.`, true);
    return value;
  };

  const record = (line: number, kind: RawStep['kind'], error?: TraceError) => {
    const snapFrames: Frame[] = frames.map((f) => ({
      id: f.id,
      name: f.name,
      line: f.line,
      locals: [...f.locals.entries()],
      ...(f.returnValue ? { returnValue: f.returnValue } : {}),
    }));
    const heap: Record<string, Omit<HeapObject, 'version'>> = {};
    for (const b of blocks.values()) {
      const typeName =
        b.kind === 'array'
          ? `${b.elemType}[${b.items.length}]`
          : b.kind === 'struct'
            ? b.elemType
            : `std::${b.kind}<${b.elemType}>`;
      heap[b.id] = {
        id: b.id,
        kind: HEAP_KIND[b.kind],
        typeName,
        region: b.region,
        address: hex(b.address),
        ...(b.kind === 'struct' ? { fields: b.fields.map(([n, v]) => [n, v] as [string, Value]) } : { items: [...b.items] }),
        ...(b.freed ? { freed: true } : {}),
      };
    }
    steps.push({ line, kind, frames: snapFrames, heap, stdoutLength: stdout.length, error });
  };

  const apply = (op: AiOp, line: number): 'call' | 'return' | undefined => {
    switch (op.op) {
      case 'call': {
        const fn = need(op.fn, 'function name for call');
        const args = (op.args ?? []).map((a) => [a.name, toValue(a.value)] as [string, Value]);
        if (frames.length) top().line = line;
        if (frames.length >= 256) throw new Stop('StackOverflow', `Too many nested calls (over 256) in ${fn}().`, false);
        frames.push({ id: `f${frames.length}`, name: fn, line, locals: new Map(args) });
        return 'call';
      }
      case 'return':
        top().returnValue = op.value ? toValue(op.value) : undefined;
        return 'return';
      case 'declare':
        top().locals.set(need(op.name, 'variable name for declare'), op.value ? toValue(op.value) : { k: 'uninit', t: op.type ?? 'int' });
        return;
      case 'assign':
      case 'read_input': {
        const name = need(op.name, `variable name for ${op.op}`);
        const frame = top().locals.has(name) ? top() : frames[0]?.locals.has(name) ? frames[0] : undefined;
        if (!frame && op.op === 'assign') throw new Stop('InvalidTrace', `Assignment to undeclared variable '${name}'.`, true);
        (frame ?? top()).locals.set(name, toValue(need(op.value, `value for ${op.op}`)));
        return;
      }
      case 'alloc': {
        const id = need(op.id, 'block id for alloc');
        if (blocks.has(id)) throw new Stop('InvalidTrace', `Block id '${id}' was allocated twice.`, true);
        const kind = (op.kind ?? (op.fields ? 'struct' : 'array')) as Block['kind'];
        if (!HEAP_KIND[kind]) throw new Stop('InvalidTrace', `Unknown alloc kind '${op.kind}'.`, true);
        const elemType = op.type ?? 'int';
        const init = (op.init ?? []).map(toValue);
        const count = kind === 'array' ? Math.max(op.count ?? init.length, init.length) : init.length;
        const items = Array.from({ length: count }, (_, i) => init[i] ?? ({ k: 'uninit', t: elemType } as Value));
        const fields = (op.fields ?? []).map((f) => [f.name, toValue(f.value)] as [string, Value]);
        const region = op.region ?? (kind === 'array' || kind === 'struct' ? 'stack' : 'heap');
        const bytes = Math.max(16, (kind === 'struct' ? fields.length * 8 : count * sizeOf(elemType)) || 16);
        let address: number;
        if (region === 'heap') {
          address = nextHeap;
          nextHeap += Math.ceil(bytes / 16) * 16;
        } else {
          nextStack -= Math.ceil(bytes / 16) * 16;
          address = nextStack;
        }
        blocks.set(id, { id, kind, elemType, region, items, fields, freed: false, address });
        return;
      }
      case 'free': {
        const id = need(op.id, 'block id for free');
        const b = blocks.get(id);
        if (!b) throw new Stop('InvalidTrace', `free of unknown block '${id}'.`, true);
        if (b.freed) throw new Stop('DoubleFree', `Block '${id}' was freed twice.`, false);
        b.freed = true;
        return;
      }
      case 'write': {
        const id = need(op.id, 'block id for write');
        const value = toValue(need(op.value, 'value for write'));
        const tgt = blocks.has(id) ? null : target(id);
        if (tgt && 'varName' in tgt) {
          tgt.frame.locals.set(tgt.varName, value);
          return;
        }
        const b = liveBlock(id, 'write');
        if (op.field !== undefined) {
          const slot = b.fields.find(([n]) => n === op.field);
          if (!slot) throw new Stop('InvalidTrace', `Block '${id}' has no field '${op.field}'.`, true);
          slot[1] = value;
          return;
        }
        const index = op.index ?? 0;
        if (index < 0 || index >= b.items.length) {
          throw new Stop('OutOfBounds', `Index ${index} is out of bounds for '${id}' of size ${b.items.length}.`, false);
        }
        b.items[index] = value;
        return;
      }
      case 'push':
      case 'enqueue':
      case 'push_back':
        liveBlock(op.id, op.op).items.push(toValue(need(op.value, `value for ${op.op}`)));
        return;
      case 'pop':
      case 'pop_back':
      case 'dequeue': {
        const b = liveBlock(op.id, op.op);
        if (!b.items.length) throw new Stop('EmptyContainer', `${op.op} on empty ${b.kind} '${b.id}'.`, false);
        if (op.op === 'dequeue' || (op.op === 'pop' && b.kind === 'queue')) b.items.shift();
        else b.items.pop();
        return;
      }
      case 'print':
        stdout += op.text ?? '';
        return;
      case 'error':
        throw new Stop(op.kind ?? 'RuntimeError', op.message ?? 'The program hit an error here.', false);
    }
  };

  const finish = (status: RawTrace['status'], error?: TraceError): ReplayResult => {
    const lensHints: Record<string, LensKind> = {};
    for (const h of result.lensHints ?? []) lensHints[h.name] = h.lens;
    return {
      rawTrace: { language: opts.language, source: opts.source, steps, stdout, status, error },
      lensHints,
      narrations,
    };
  };

  let line = 1;
  try {
    for (const [i, step] of result.steps.entries()) {
      if (i >= opts.stepLimit) throw new Stop('StepLimit', `Stopped after ${opts.stepLimit} steps.`, false);
      line = step.line;
      if (line < 1 || line > lineCount) throw new Stop('InvalidTrace', `Step ${i + 1} points at line ${line}, but the program has ${lineCount} lines.`, true);
      let kind: RawStep['kind'] = 'line';
      for (const op of step.ops) kind = apply(op, line) ?? kind;
      if (frames.length) top().line = line;
      narrations.push(step.narration);
      record(line, kind);
      if (kind === 'return') frames.pop();
    }
    return finish('completed');
  } catch (err) {
    if (!(err instanceof Stop)) throw err;
    const limit = err.kind === 'StepLimit';
    const error: TraceError = {
      phase: limit ? 'limit' : 'runtime',
      kind: err.invalid ? 'InvalidAiTrace' : err.kind,
      line,
      message: err.message,
      title: err.invalid ? 'The AI trace stopped making sense here' : (ERROR_TITLES[err.kind] ?? 'Runtime error'),
      explanation: err.invalid
        ? `The AI's description of the program broke a rule at this point (${err.message}) so the trace stops here instead of guessing. Running again may help.`
        : err.message,
      context: [],
    };
    narrations.push(undefined);
    record(line, limit ? 'limit' : 'exception', error);
    return finish(limit ? 'limit' : 'error', error);
  }
}

function hex(n: number): string {
  return '0x' + n.toString(16).padStart(8, '0');
}

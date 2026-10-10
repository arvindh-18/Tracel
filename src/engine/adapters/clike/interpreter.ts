import { RawStep, RawTrace } from '../../../trace/normalize';
import { Frame, HeapObject, TraceError, TraceEvent, Value } from '../../../trace/schema';
import { CompileError } from './lexer';
import { CONTAINERS, Declarator, Expr, FunctionDef, Program, Stmt, StructDef, TypeInfo, parseProgram, typeName } from './parser';

export interface ExecOptions {
  stepLimit?: number;
  stdin?: string;
  /** Called every few hundred steps with the step count so far. */
  onProgress?: (steps: number) => void;
}

// ---- Runtime model ----
//
// Every variable lives in a Block. A scalar variable is a one-slot block, an
// array is an n-slot block, a struct keeps named fields, and the STL
// containers keep their items. Pointers are (block, offset) pairs, so &x,
// array decay, pointer arithmetic and new/delete all share one model.

type BlockKind = 'scalar' | 'array' | 'struct' | 'vector' | 'cpp_stack' | 'cpp_queue' | 'deque' | 'map' | 'set' | 'pq';

interface Block {
  id: string;
  kind: BlockKind;
  region: 'stack' | 'heap' | 'static';
  elemType: TypeInfo; // slot type (scalar/array/containers)
  struct?: StructDef;
  items: RV[];
  fields: Map<string, RV>;
  /** std::map / std::unordered_map entries; kept sorted by key for std::map. */
  entries: { k: RV; v: RV }[];
  valType?: TypeInfo; // map value type
  ordered?: boolean; // std::map / std::set keep keys sorted
  /** priority_queue order: greater<T> makes a min-heap; a comparator overrides both. */
  minHeap?: boolean;
  cmp?: RV;
  freed: boolean;
  dead: boolean; // stack storage whose scope has ended
  addr: number;
}

type RV =
  | { t: 'int'; v: number }
  | { t: 'long'; v: bigint } // long, long long, size_t: 64-bit
  | { t: 'float'; v: number }
  | { t: 'bool'; v: boolean }
  | { t: 'char'; v: number }
  | { t: 'str'; v: string }
  | { t: 'ptr'; b: Block | null; o: number; ty: TypeInfo }
  | { t: 'agg'; b: Block }
  | { t: 'uninit'; ty: TypeInfo }
  | { t: 'void' }
  | { t: 'stream'; name: 'cout' | 'cin' | 'cerr' }
  | { t: 'manip'; name: string; arg?: number }
  | { t: 'fn'; fn: FunctionDef; closure: Scope[]; self?: Block } // lambda or function used as a value
  | { t: 'iter'; b: Block; o: number } // map/set iterator: position in entries/items
  | { t: 'siter'; lv: LV; o: number } // std::string iterator
  | { t: 'cmp'; greater: boolean }; // std::greater<T>() / std::less<T>()

type LV =
  | { b: Block; i: number; name?: string; indexName?: string }
  | { b: Block; f: string; name?: string }
  | { b: Block; whole: true; name?: string }
  | { b: Block; key: string; name?: string } // a map entry's value: m[key]
  | { b: Block; strOf: LV; i: number; name?: string }; // one character of a std::string

interface Scope {
  vars: Map<string, LV>;
  owned: Block[];
}

interface CallFrame {
  id: string;
  name: string;
  line: number;
  scopes: Scope[];
  returnValue?: RV;
  /** The object a member function runs on. */
  self?: Block;
  /** A lambda's enclosing scopes, searched after its own (captures behave as by reference). */
  closure?: Scope[];
  returnType?: TypeInfo;
}

class RuntimeErr extends Error {
  constructor(
    public kind: string,
    public title: string,
    message: string,
    public explanation: string = message,
    public context: { name: string; value: Value }[] = []
  ) {
    super(message);
  }
}
class ReturnSignal {
  constructor(public value: RV) {}
}
class BreakSignal {}
class ContinueSignal {}
class LimitSignal {}

const INT_TYPE: TypeInfo = { base: 'int', args: [], ptr: 0, ref: false };
const isIntBase = (b: string) => ['int', 'short', 'long', 'long long', 'size_t'].includes(b);
const isWideBase = (b: string) => b === 'long' || b === 'long long' || b === 'size_t';
const isFloatBase = (b: string) => b === 'float' || b === 'double';

function sizeOf(t: TypeInfo, structs: Map<string, StructDef>): number {
  if (t.ptr) return 8;
  switch (t.base) {
    case 'char':
    case 'bool':
      return 1;
    case 'short':
      return 2;
    case 'int':
    case 'float':
      return 4;
    case 'long':
    case 'long long':
    case 'double':
    case 'size_t':
      return 8;
    case 'string':
      return 32;
  }
  if (CONTAINERS.has(t.base)) return 24;
  const def = structs.get(t.base);
  if (def) return def.fields.reduce((n, f) => n + sizeOf(f.type, structs), 0) || 1;
  return 4;
}

export function runClikeInterpreter(source: string, options: ExecOptions = {}): RawTrace {
  const language: 'c' | 'cpp' = /#include\s*<(iostream|vector|string|stack|queue)>|std::|\bcout\b|\bnew\b/.test(source) ? 'cpp' : 'c';

  let program: Program;
  try {
    program = parseProgram(source);
  } catch (err) {
    if (err instanceof CompileError) {
      const unsupported = err.phase === 'unsupported';
      return {
        language,
        source,
        steps: [],
        stdout: '',
        status: 'error',
        error: {
          phase: err.phase,
          kind: unsupported ? 'UnsupportedFeature' : 'SyntaxError',
          line: err.line,
          column: err.col,
          message: err.message,
          title: unsupported ? 'Unsupported feature' : 'Syntax error',
          explanation: err.message,
          context: [],
        },
      };
    }
    throw err;
  }

  return new Interpreter(program, source, language, options).run();
}

class Interpreter {
  private steps: RawStep[] = [];
  private stdout = '';
  private stdin: string[];
  private stdinPos = 0;
  private stepLimit: number;
  private stack: CallFrame[] = [];
  private globals: Scope = { vars: new Map(), owned: [] };
  private blocks = new Map<string, Block>();
  private blockCounter = 0;
  private nextStack = 0x7ffe_c000;
  private nextHeap = 0x5580_0000;
  private pendingEvents: TraceEvent[] = [];
  private loopCounts = new Map<Stmt, number>();
  private coutFixed = false;
  private coutPrecision = 6;
  private rngState = 1;
  private onProgress?: (steps: number) => void;

  constructor(
    private program: Program,
    private source: string,
    private language: 'c' | 'cpp',
    options: ExecOptions
  ) {
    this.stepLimit = options.stepLimit ?? 5000;
    this.onProgress = options.onProgress;
    this.stdin = (options.stdin ?? '').split(/\s+/).filter(Boolean);
  }

  run(): RawTrace {
    const done = (status: RawTrace['status'], error?: TraceError): RawTrace => ({
      language: this.language,
      source: this.source,
      steps: this.steps,
      stdout: this.stdout,
      status,
      error,
      recordedBefore: true,
    });

    try {
      for (const g of this.program.globals) this.execDecl(g as Stmt & { type: 'Decl' }, this.globals, 'static');
      const main = this.program.functions.get('main');
      if (!main) {
        const solution = this.program.structs.get('Solution');
        throw new RuntimeErr(
          'NoMain',
          'No main function',
          'This program has no main() function, so there is nothing to run.',
          solution
            ? 'LeetCode solutions have no main(). Add one that builds an example input and calls your method, e.g. int main() { Solution s; vector<int> nums = {2, 7, 11, 15}; s.twoSum(nums, 9); }'
            : 'C and C++ programs start running at main(). Add an int main() { ... } function.'
        );
      }
      this.callFunction(main, [], main.line);
      return done('completed');
    } catch (err) {
      const line = this.currentLine();
      if (err instanceof LimitSignal) {
        return done('limit', {
          phase: 'limit',
          kind: 'StepLimit',
          line,
          message: `Step limit of ${this.stepLimit} steps exceeded.`,
          title: 'Execution stopped (step limit)',
          explanation: `Tracel stopped the program after ${this.stepLimit} steps. This may be an infinite loop.`,
          context: [],
        });
      }
      if (err instanceof RuntimeErr) {
        const error: TraceError = {
          phase: 'runtime',
          kind: err.kind,
          line,
          message: err.message,
          title: err.title,
          explanation: err.explanation,
          context: err.context,
          stateNote: 'The program stopped here, so the line that failed did not finish.',
        };
        this.record(line, 'exception', error);
        return done('error', error);
      }
      throw err;
    }
  }

  // ---- steps ----

  private currentLine(): number {
    return this.stack.length ? this.stack[this.stack.length - 1]!.line : 1;
  }

  private step(line: number, range?: { from: number; to: number }) {
    if (this.stack.length) this.stack[this.stack.length - 1]!.line = line;
    this.record(line, 'line', undefined, range);
  }

  private record(line: number, kind: RawStep['kind'], error?: TraceError, range?: { from: number; to: number }) {
    if (this.steps.length >= this.stepLimit) throw new LimitSignal();
    if (this.steps.length % 250 === 0 && this.steps.length) this.onProgress?.(this.steps.length);
    const frames: Frame[] = [];
    if (this.globals.vars.size) frames.push(this.snapshotFrame('globals', 'globals', 0, [this.globals]));
    for (const f of this.stack) {
      const frame = this.snapshotFrame(f.id, f.name, f.line, f.scopes);
      if (kind === 'return' && f === this.stack[this.stack.length - 1] && f.returnValue && f.returnValue.t !== 'void') {
        frame.returnValue = this.toValue(f.returnValue, INT_TYPE);
      }
      frames.push(frame);
    }

    const heap: Record<string, Omit<HeapObject, 'version'>> = {};
    for (const b of this.blocks.values()) {
      if (b.kind === 'scalar' && b.region !== 'heap') continue;
      heap[b.id] = this.toHeapObject(b);
    }

    this.steps.push({
      line,
      kind,
      range,
      frames,
      heap,
      stdoutLength: this.stdout.length,
      error,
      explicitEvents: this.pendingEvents.length ? this.pendingEvents : undefined,
    });
    this.pendingEvents = [];
  }

  private snapshotFrame(id: string, name: string, line: number, scopes: Scope[]): Frame {
    const locals = new Map<string, Value>();
    for (const scope of scopes) {
      for (const [varName, lv] of scope.vars) {
        locals.delete(varName); // inner scope shadows, and moves to the end
        locals.set(varName, this.lvToValue(lv));
      }
    }
    return { id, name, line, locals: [...locals.entries()] };
  }

  private lvToValue(lv: LV): Value {
    if ('whole' in lv) return { k: lv.b.kind === 'array' || lv.b.kind === 'struct' ? 'inline' : 'ref', id: lv.b.id };
    if (lv.b.dead || lv.b.freed) return { k: 'uninit', t: typeName(lv.b.elemType) };
    if ('key' in lv || 'strOf' in lv) {
      try {
        return this.toValue(this.read(lv), lv.b.valType ?? lv.b.elemType);
      } catch {
        return { k: 'uninit', t: '?' };
      }
    }
    if ('f' in lv) return this.toValue(lv.b.fields.get(lv.f)!, this.fieldType(lv.b, lv.f));
    return this.toValue(lv.b.items[lv.i] ?? { t: 'uninit', ty: lv.b.elemType }, lv.b.elemType);
  }

  private toValue(rv: RV, ty: TypeInfo): Value {
    switch (rv.t) {
      case 'int':
      case 'long':
        return { k: 'int', v: String(rv.v) };
      case 'float':
        return { k: 'float', v: rv.v };
      case 'bool':
        return { k: 'bool', v: rv.v };
      case 'char':
        return { k: 'char', v: rv.v };
      case 'str':
        return { k: 'str', v: rv.v };
      case 'ptr':
        return {
          k: 'ptr',
          id: rv.b ? rv.b.id : null,
          offset: rv.o,
          t: typeName(rv.ty),
          address: rv.b ? this.hex(rv.b.addr + rv.o * sizeOf(rv.ty, this.program.structs)) : '0x0',
        };
      case 'agg':
        return { k: rv.b.kind === 'array' || rv.b.kind === 'struct' ? 'inline' : 'ref', id: rv.b.id };
      case 'uninit':
        return { k: 'uninit', t: typeName(rv.ty) };
      case 'fn':
        return { k: 'fn', name: rv.fn.name };
      case 'cmp':
        return { k: 'fn', name: rv.greater ? 'greater' : 'less' };
      case 'iter':
        return { k: 'ptr', id: rv.b.id, offset: rv.o, t: 'iterator', address: `${this.hex(rv.b.addr)}+${rv.o}` };
      case 'siter':
        return { k: 'int', v: String(rv.o) };
      default:
        return { k: 'uninit', t: typeName(ty) };
    }
  }

  private toHeapObject(b: Block): Omit<HeapObject, 'version'> {
    const base = { id: b.id, region: b.region, address: this.hex(b.addr), freed: b.freed || undefined };
    const elem = typeName(b.elemType);
    switch (b.kind) {
      case 'struct':
        return {
          ...base,
          kind: 'struct',
          typeName: b.struct!.name,
          fields: [...b.fields.entries()].map(([f, v]) => [f, this.toValue(v, this.fieldType(b, f))]),
        };
      case 'vector':
        return { ...base, kind: 'vector', typeName: `std::vector<${elem}>`, items: b.items.map((v) => this.toValue(v, b.elemType)) };
      case 'cpp_stack':
        return { ...base, kind: 'cpp_stack', typeName: `std::stack<${elem}>`, items: b.items.map((v) => this.toValue(v, b.elemType)) };
      case 'cpp_queue':
        return { ...base, kind: 'cpp_queue', typeName: `std::queue<${elem}>`, items: b.items.map((v) => this.toValue(v, b.elemType)) };
      case 'deque':
        return { ...base, kind: 'cpp_deque', typeName: `std::deque<${elem}>`, items: b.items.map((v) => this.toValue(v, b.elemType)) };
      case 'set':
        return { ...base, kind: 'set', typeName: `std::${b.ordered ? 'set' : 'unordered_set'}<${elem}>`, items: b.items.map((v) => this.toValue(v, b.elemType)) };
      case 'pq':
        return { ...base, kind: 'cpp_priority_queue', typeName: `std::priority_queue<${elem}>`, items: b.items.map((v) => this.toValue(v, b.elemType)) };
      case 'map':
        return {
          ...base,
          kind: 'dict',
          typeName: `std::${b.ordered ? 'map' : 'unordered_map'}<${elem}, ${typeName(b.valType ?? INT_TYPE)}>`,
          entries: b.entries.map((e) => [this.toValue(e.k, b.elemType), this.toValue(e.v, b.valType ?? INT_TYPE)] as [Value, Value]),
        };
      default:
        return {
          ...base,
          kind: 'array',
          typeName:
            b.kind === 'scalar'
              ? elem
              : b.items[0]?.t === 'agg'
                ? `${elem}[${b.items.length}][${b.items[0].b.items.length}]`
                : `${elem}[${b.items.length}]`,
          items: b.items.map((v) => this.toValue(v, b.elemType)),
        };
    }
  }

  private hex(n: number): string {
    return '0x' + n.toString(16).padStart(8, '0');
  }

  // ---- storage ----

  /** `label` names a variable's own storage, so a pointer to it reads "→ x" rather than "→ h3". */
  private alloc(kind: BlockKind, region: Block['region'], elemType: TypeInfo, items: RV[] = [], struct?: StructDef, label?: string): Block {
    let id = label ?? `h${++this.blockCounter}`;
    for (let n = 2; label && this.blocks.has(id); n++) id = `${label}#${n}`;
    const count = Math.max(1, items.length);
    const bytes = struct ? sizeOf({ ...INT_TYPE, base: struct.name }, this.program.structs) : count * sizeOf(elemType, this.program.structs);
    let addr: number;
    if (region === 'heap') {
      addr = this.nextHeap;
      this.nextHeap += Math.max(16, Math.ceil(bytes / 16) * 16);
    } else {
      this.nextStack -= Math.max(8, Math.ceil(bytes / 8) * 8);
      addr = this.nextStack;
    }
    const b: Block = { id, kind, region, elemType, struct, items, fields: new Map(), entries: [], freed: false, dead: false, addr };
    this.blocks.set(id, b);
    return b;
  }

  private releaseScope(scope: Scope) {
    for (const b of scope.owned) {
      b.dead = true;
      this.blocks.delete(b.id);
    }
  }

  private fieldType(b: Block, f: string): TypeInfo {
    return b.struct?.fields.find((x) => x.name === f)?.type ?? INT_TYPE;
  }

  /** A fresh value of `type`: uninitialized scalars, empty containers, structs with default fields. */
  private makeDefault(type: TypeInfo, region: Block['region'], owner: Block[] | null, zero = false): RV {
    if (type.ptr) return zero ? { t: 'ptr', b: null, o: 0, ty: this.pointee(type) } : { t: 'uninit', ty: type };
    if (type.base === 'string') return { t: 'str', v: '' };
    if (CONTAINERS.has(type.base)) {
      const kinds: Record<string, BlockKind> = {
        stack: 'cpp_stack',
        queue: 'cpp_queue',
        deque: 'deque',
        map: 'map',
        unordered_map: 'map',
        set: 'set',
        unordered_set: 'set',
        priority_queue: 'pq',
      };
      const b = this.alloc(kinds[type.base] ?? 'vector', 'heap', type.args[0] ?? INT_TYPE);
      if (b.kind === 'map') b.valType = type.args[1] ?? INT_TYPE;
      b.ordered = type.base === 'map' || type.base === 'set';
      if (b.kind === 'pq') b.minHeap = type.args[2]?.base === 'greater';
      owner?.push(b);
      return { t: 'agg', b };
    }
    const def = this.structOf(type);
    if (def) {
      const b = this.alloc('struct', region, type, [], def);
      owner?.push(b);
      for (const f of def.fields) {
        let v: RV;
        if (f.init) v = this.coerce(this.evalR(f.init), f.type);
        else if (f.arraySize !== undefined) {
          const dims = [f.arraySize ? this.toNum(this.evalR(f.arraySize)) : 0, ...(f.innerDims ?? []).map((d) => this.toNum(this.evalR(d)))];
          v = { t: 'agg', b: this.makeArray(f.type, dims, region, owner ?? [], zero) };
        } else v = this.makeDefault(f.type, region, owner, zero);
        b.fields.set(f.name, v);
      }
      return { t: 'agg', b };
    }
    if (zero) return this.coerce({ t: 'int', v: 0 }, type);
    return { t: 'uninit', ty: type };
  }

  /** An array block; a 2-D array is an array of row blocks. */
  private makeArray(elem: TypeInfo, dims: number[], region: Block['region'], owner: Block[], zero: boolean, label?: string): Block {
    const [n, ...rest] = dims;
    if (n! < 0) throw new RuntimeErr('BadAlloc', 'Invalid array size', `An array cannot have size ${n}.`);
    const items: RV[] = Array.from({ length: n! }, () =>
      rest.length ? { t: 'agg', b: this.makeArray(elem, rest, region, owner, zero) } : this.makeDefault(elem, region, owner, zero)
    );
    const b = this.alloc('array', region, elem, items, undefined, label);
    owner.push(b);
    return b;
  }

  private pairDefs = new Map<string, StructDef>();

  /** A user struct/class, or the built-in std::pair<A, B> (first, second). */
  private structOf(type: TypeInfo): StructDef | undefined {
    if (type.ptr) return undefined;
    if (type.base !== 'pair') return this.program.structs.get(type.base);
    const [a = INT_TYPE, b = INT_TYPE] = type.args;
    const name = `pair<${typeName(a)}, ${typeName(b)}>`;
    let def = this.pairDefs.get(name);
    if (!def) {
      def = { name, fields: [{ name: 'first', type: a }, { name: 'second', type: b }], methods: new Map() };
      this.pairDefs.set(name, def);
    }
    return def;
  }

  /** A stable string for comparing keys and values (map keys, set members, ==). */
  private keyOf(v: RV): string {
    switch (v.t) {
      case 'int':
      case 'float':
      case 'char':
        return `n:${v.v}`;
      case 'long':
        return `n:${v.v}`;
      case 'bool':
        return `n:${v.v ? 1 : 0}`;
      case 'str':
        return `s:${v.v}`;
      case 'ptr':
        return `p:${v.b?.id ?? 'null'}+${v.o}`;
      case 'agg':
        return v.b.kind === 'struct'
          ? `{${[...v.b.fields.values()].map((f) => this.keyOf(f)).join(',')}}`
          : `[${v.b.items.map((x) => this.keyOf(x)).join(',')}]`;
      default:
        return `?:${v.t}`;
    }
  }

  /** Orders values the way C++'s < does: numbers, strings, then pairs and vectors element by element. */
  private compareRV(a: RV, b: RV): number {
    if (a.t === 'str' || b.t === 'str') {
      const x = a.t === 'str' ? a.v : String.fromCharCode(this.toNum(a));
      const y = b.t === 'str' ? b.v : String.fromCharCode(this.toNum(b));
      return x < y ? -1 : x > y ? 1 : 0;
    }
    if (a.t === 'agg' && b.t === 'agg') {
      const xs = a.b.kind === 'struct' ? [...a.b.fields.values()] : a.b.items;
      const ys = b.b.kind === 'struct' ? [...b.b.fields.values()] : b.b.items;
      for (let i = 0; i < Math.min(xs.length, ys.length); i++) {
        const c = this.compareRV(xs[i]!, ys[i]!);
        if (c) return c;
      }
      return xs.length - ys.length;
    }
    if (a.t === 'long' || b.t === 'long') {
      const x = this.toBig(a);
      const y = this.toBig(b);
      return x < y ? -1 : x > y ? 1 : 0;
    }
    return this.toNum(a) - this.toNum(b);
  }

  /** Strict weak ordering for sort/priority_queue: a comparator function, greater/less, or <. */
  private lessThan(a: RV, b: RV, cmp?: RV): boolean {
    if (cmp?.t === 'fn') return this.truthy(this.callFunction(cmp.fn, [a, b], this.currentLine(), cmp.self, cmp.closure));
    if (cmp?.t === 'cmp' && cmp.greater) return this.compareRV(a, b) > 0;
    return this.compareRV(a, b) < 0;
  }

  /** Evaluates `e` as a value of `type`; a { ... } list builds that type. */
  private evalAs(e: Expr, type: TypeInfo, owner: Block[] | null = this.ownerList()): RV {
    if (e.type !== 'InitList') return this.evalR(e);
    const v = this.makeDefault(type, type.ptr ? 'stack' : 'heap', owner, true);
    if (v.t === 'agg') {
      this.fillFromList(v.b, e.items);
      return v;
    }
    return e.items[0] ? this.coerce(this.evalR(e.items[0]), type) : v;
  }

  /** Stores a value in a container slot: containers and structs are copied (value semantics). */
  private stored(v: RV, type: TypeInfo): RV {
    return v.t === 'agg' ? { t: 'agg', b: this.copyAgg(v.b, 'heap', null) } : this.coerce(v, type);
  }

  private mapFind(b: Block, key: string): number {
    return b.entries.findIndex((e) => this.keyOf(e.k) === key);
  }

  /** Inserts (or, with overwrite, replaces) a map entry, keeping std::map sorted. */
  private mapPut(b: Block, k: RV, v: RV, overwrite: boolean): number {
    const key = this.stored(k, b.elemType);
    const at = this.mapFind(b, this.keyOf(key));
    if (at >= 0) {
      if (overwrite) b.entries[at]!.v = this.stored(v, b.valType ?? INT_TYPE);
      return at;
    }
    const entry = { k: key, v: this.stored(v, b.valType ?? INT_TYPE) };
    if (!b.ordered) return b.entries.push(entry) - 1;
    let i = 0;
    while (i < b.entries.length && this.compareRV(b.entries[i]!.k, key) < 0) i++;
    b.entries.splice(i, 0, entry);
    return i;
  }

  private setPut(b: Block, v: RV): boolean {
    const item = this.stored(v, b.elemType);
    const key = this.keyOf(item);
    if (b.items.some((x) => this.keyOf(x) === key)) return false;
    if (!b.ordered) b.items.push(item);
    else {
      let i = 0;
      while (i < b.items.length && this.compareRV(b.items[i]!, item) < 0) i++;
      b.items.splice(i, 0, item);
    }
    return true;
  }

  /** priority_queue as a real binary heap, so the Tree layout shows its shape. */
  private pqBefore(b: Block, x: RV, y: RV): boolean {
    // True when x should sit above y. The default (less) gives a max-heap.
    if (b.cmp) return this.lessThan(y, x, b.cmp);
    return b.minHeap ? this.compareRV(x, y) < 0 : this.compareRV(x, y) > 0;
  }

  private pqPush(b: Block, v: RV) {
    const h = b.items;
    h.push(this.stored(v, b.elemType));
    for (let i = h.length - 1; i > 0; ) {
      const parent = (i - 1) >> 1;
      if (!this.pqBefore(b, h[i]!, h[parent]!)) break;
      [h[i], h[parent]] = [h[parent]!, h[i]!];
      i = parent;
    }
  }

  private pqPop(b: Block) {
    const h = b.items;
    const last = h.pop()!;
    if (!h.length) return;
    h[0] = last;
    for (let i = 0; ; ) {
      const l = 2 * i + 1;
      const r = l + 1;
      let best = i;
      if (l < h.length && this.pqBefore(b, h[l]!, h[best]!)) best = l;
      if (r < h.length && this.pqBefore(b, h[r]!, h[best]!)) best = r;
      if (best === i) break;
      [h[i], h[best]] = [h[best]!, h[i]!];
      i = best;
    }
  }

  /** Builds a library temporary: vector<int>(n, 0), pair<int,int>(a, b), string(3, 'x'), greater<int>(). */
  private constructTemp(type: TypeInfo, argExprs: Expr[], brace: boolean): RV {
    if (type.base === 'greater' || type.base === 'less') return { t: 'cmp', greater: type.base === 'greater' };
    if (type.base === 'string') {
      const args = argExprs.map((a) => this.evalR(a));
      if (args.length === 2) return { t: 'str', v: String.fromCharCode(this.toNum(args[1]!)).repeat(Math.max(0, this.toNum(args[0]!))) };
      if (brace) return { t: 'str', v: args.map((c) => String.fromCharCode(this.toNum(c))).join('') };
      return args[0]?.t === 'str' ? args[0] : { t: 'str', v: '' };
    }
    const v = this.makeDefault(type, 'stack', this.ownerList(), true);
    if (v.t !== 'agg') return argExprs[0] ? this.coerce(this.evalR(argExprs[0]), type) : v;
    if (brace || v.b.kind === 'struct') this.fillFromList(v.b, argExprs);
    else this.applyCtorArgs(v.b, argExprs);
    return v;
  }

  /** Constructor arguments for library containers: (n), (n, fill), (other), (first, last), (comparator). */
  private applyCtorArgs(b: Block, argExprs: Expr[]) {
    if (!argExprs.length) return;
    const args = argExprs.map((a) => this.evalR(a));
    const [a0, a1] = args;
    if (a0?.t === 'agg') {
      const copy = this.copyAgg(a0.b, b.region, null);
      this.blocks.delete(copy.id);
      if (b.kind === 'pq') copy.items.forEach((x) => this.pqPush(b, x));
      else if (b.kind === 'set') copy.items.forEach((x) => this.setPut(b, x));
      else {
        b.items = copy.items;
        b.entries = copy.entries;
      }
      return;
    }
    if (a0?.t === 'ptr' && a1?.t === 'ptr' && a0.b && a0.b === a1.b) {
      const slice = a0.b.items.slice(a0.o, a1.o);
      if (b.kind === 'pq') slice.forEach((x) => this.pqPush(b, x));
      else if (b.kind === 'set') slice.forEach((x) => this.setPut(b, x));
      else b.items = slice.map((x) => this.stored(x, b.elemType));
      return;
    }
    if (a0?.t === 'fn' || a0?.t === 'cmp') {
      b.cmp = a0;
      return;
    }
    if (b.kind === 'vector' || b.kind === 'deque') {
      const n = this.toNum(a0!);
      b.items = Array.from({ length: n }, () => (a1 ? this.stored(a1, b.elemType) : this.makeDefault(b.elemType, 'heap', null, true)));
      return;
    }
    throw new RuntimeErr('Unsupported', 'Unsupported feature', `This constructor form isn't supported for ${typeName(b.elemType)} containers yet.`);
  }

  /** A throwaway pair block (not shown in the heap). */
  private pairOf(first: RV, second: RV): Block {
    const b = (this.makeDefault({ ...INT_TYPE, base: 'pair', args: [this.typeOfValue(first), this.typeOfValue(second)] }, 'stack', null) as RV & { t: 'agg' }).b;
    this.blocks.delete(b.id);
    b.fields.set('first', first);
    b.fields.set('second', second);
    return b;
  }

  /** auto [a, b] = value: binds names to a pair/struct's fields or an array's items. */
  private bindNames(names: string[], v: RV, scope: Scope, byRef: boolean) {
    if (v.t !== 'agg') throw new RuntimeErr('TypeError', 'Invalid structured binding', 'A structured binding needs a pair, struct or array on the right.');
    const parts: LV[] =
      v.b.kind === 'struct' ? [...v.b.fields.keys()].map((f) => ({ b: v.b, f })) : v.b.items.map((_, i) => ({ b: v.b, i }));
    names.forEach((name, i) => {
      const part = parts[i];
      if (!part) throw new RuntimeErr('TypeError', 'Invalid structured binding', `There is no element ${i} to bind to '${name}'.`);
      if (byRef) {
        scope.vars.set(name, part);
        return;
      }
      const value = this.read(part);
      if (value.t === 'agg') scope.vars.set(name, { b: this.copyAgg(value.b, 'stack', scope.owned), whole: true });
      else {
        const cell = this.alloc('scalar', 'stack', this.typeOfValue(value), [value], undefined, name);
        scope.owned.push(cell);
        scope.vars.set(name, { b: cell, i: 0 });
      }
    });
  }

  private pointee(t: TypeInfo): TypeInfo {
    return { ...t, ptr: Math.max(0, t.ptr - 1), ref: false };
  }

  /** Deep copy for value semantics (struct assignment, passing a vector by value). */
  private copyAgg(src: Block, region: Block['region'], owner: Block[] | null): Block {
    const items = src.items.map((v) => (v.t === 'agg' ? ({ t: 'agg', b: this.copyAgg(v.b, region, owner) } as RV) : v));
    const b = this.alloc(src.kind, src.kind === 'array' || src.kind === 'struct' ? region : 'heap', src.elemType, items, src.struct);
    for (const [f, v] of src.fields) b.fields.set(f, v.t === 'agg' ? { t: 'agg', b: this.copyAgg(v.b, region, owner) } : v);
    b.entries = src.entries.map((e) => ({ k: e.k, v: e.v.t === 'agg' ? ({ t: 'agg', b: this.copyAgg(e.v.b, region, owner) } as RV) : e.v }));
    b.valType = src.valType;
    b.ordered = src.ordered;
    b.minHeap = src.minHeap;
    b.cmp = src.cmp;
    owner?.push(b);
    return b;
  }

  private ownerList(): Block[] {
    const frame = this.stack[this.stack.length - 1];
    return frame ? frame.scopes[frame.scopes.length - 1]!.owned : this.globals.owned;
  }

  // ---- lvalues ----

  private read(lv: LV): RV {
    this.checkAlive(lv.b, lv.name);
    if ('strOf' in lv) {
      const s = this.read(lv.strOf);
      if (s.t !== 'str') throw new RuntimeErr('TypeError', 'Not a string', 'Only strings can be indexed this way.');
      this.checkBounds(s.v.length, lv.i, lv.name);
      return { t: 'char', v: s.v.charCodeAt(lv.i) };
    }
    if ('key' in lv) {
      const at = this.mapFind(lv.b, lv.key);
      if (at < 0) throw new RuntimeErr('OutOfRange', 'Key not found', `${lv.name ? `'${lv.name}'` : 'The map'} has no entry for this key.`, 'at() and iterators need the key to exist. Check count() or find() first.');
      return lv.b.entries[at]!.v;
    }
    if ('whole' in lv) return { t: 'agg', b: lv.b };
    if ('f' in lv) {
      if (!lv.b.fields.has(lv.f)) throw new RuntimeErr('UnknownField', 'Unknown field', `'${lv.b.struct?.name}' has no field named '${lv.f}'.`);
      return lv.b.fields.get(lv.f)!;
    }
    this.checkBounds(lv.b.items.length, lv.i, lv.name, lv.indexName);
    return lv.b.items[lv.i]!;
  }

  private write(lv: LV, value: RV) {
    this.checkAlive(lv.b, lv.name);
    if ('strOf' in lv) {
      const s = this.read(lv.strOf);
      if (s.t !== 'str') throw new RuntimeErr('TypeError', 'Not a string', 'Only strings can be indexed this way.');
      this.checkBounds(s.v.length, lv.i, lv.name);
      const ch = String.fromCharCode(this.toNum(value));
      this.write(lv.strOf, { t: 'str', v: s.v.slice(0, lv.i) + ch + s.v.slice(lv.i + 1) });
      return;
    }
    if ('key' in lv) {
      const at = this.mapFind(lv.b, lv.key);
      const entry = lv.b.entries[at];
      if (!entry) throw new RuntimeErr('OutOfRange', 'Key not found', 'The map has no entry for this key.');
      if (entry.v.t === 'agg') this.assignAgg(entry.v.b, value);
      else entry.v = this.coerce(value, lv.b.valType ?? INT_TYPE);
      return;
    }
    if ('whole' in lv) {
      this.assignAgg(lv.b, value);
      return;
    }
    if ('f' in lv) {
      const ty = this.fieldType(lv.b, lv.f);
      const cur = lv.b.fields.get(lv.f);
      if (cur?.t === 'agg') this.assignAgg(cur.b, value);
      else lv.b.fields.set(lv.f, this.coerce(value, ty));
      return;
    }
    this.checkBounds(lv.b.items.length, lv.i, lv.name, lv.indexName);
    const cur = lv.b.items[lv.i];
    if (cur?.t === 'agg') this.assignAgg(cur.b, value);
    else lv.b.items[lv.i] = this.coerce(value, lv.b.elemType);
  }

  private assignAgg(dst: Block, value: RV) {
    if (value.t === 'agg') {
      if (value.b === dst) return;
      const copy = this.copyAgg(value.b, dst.region, null);
      this.blocks.delete(copy.id);
      dst.items = copy.items;
      dst.fields = copy.fields;
      dst.entries = copy.entries;
      return;
    }
    if (value.t === 'void' && dst.kind !== 'struct') return;
    throw new RuntimeErr('TypeError', 'Type mismatch', `Cannot assign a ${value.t} to a ${dst.kind}.`);
  }

  private checkAlive(b: Block, name?: string) {
    if (b.freed) {
      throw new RuntimeErr('UseAfterFree', 'Use after free', `${name ? `'${name}'` : 'This pointer'} points to memory that was already freed.`, 'The program used memory after giving it back with delete or free. That memory no longer belongs to the program.');
    }
    if (b.dead) {
      throw new RuntimeErr('DanglingPointer', 'Dangling pointer', `${name ? `'${name}'` : 'This pointer'} points to a local variable whose function has already returned.`, 'Local variables disappear when their function returns, so a pointer to one is left pointing at nothing.');
    }
  }

  private checkBounds(n: number, i: number, name?: string, indexName?: string) {
    if (i >= 0 && i < n) return;
    const label = name ? `'${name}'` : 'This array';
    const context: { name: string; value: Value }[] = [];
    if (indexName) context.push({ name: indexName, value: { k: 'int', v: String(i) } });
    throw new RuntimeErr(
      'OutOfBounds',
      'Index out of bounds',
      `OutOfBounds: index ${i} is out of bounds for ${label} of size ${n}.`,
      n === 0
        ? `${label} is empty, so there is no element at index ${i}.`
        : `${label} has ${n} element${n === 1 ? '' : 's'} (indices 0 to ${n - 1}), but the program used index ${i}.`,
      context
    );
  }

  private lookup(name: string): LV | undefined {
    const frame = this.stack[this.stack.length - 1];
    if (frame) {
      for (let s = frame.scopes.length - 1; s >= 0; s--) {
        const lv = frame.scopes[s]!.vars.get(name);
        if (lv) return lv;
      }
      for (let s = (frame.closure?.length ?? 0) - 1; s >= 0; s--) {
        const lv = frame.closure![s]!.vars.get(name);
        if (lv) return lv;
      }
    }
    return this.globals.vars.get(name);
  }

  private evalL(e: Expr): LV {
    switch (e.type) {
      case 'Ident': {
        const lv = this.lookup(e.name) ?? this.memberOfSelf(e.name);
        if (!lv) throw new RuntimeErr('NameError', 'Unknown name', `'${e.name}' was not declared.`, `'${e.name}' is used here, but no variable with that name exists at this point.`);
        return { ...lv, name: e.name };
      }
      case 'Index': {
        const obj = this.evalR(e.object);
        const name = this.exprName(e.object);
        if (obj.t === 'agg' && obj.b.kind === 'map') {
          // m[key] inserts a default value when the key is missing, like C++.
          const key = this.coerce(this.evalAs(e.index, obj.b.elemType), obj.b.elemType);
          let at = this.mapFind(obj.b, this.keyOf(key));
          if (at < 0) at = this.mapPut(obj.b, key, this.makeDefault(obj.b.valType ?? INT_TYPE, 'heap', null, true), false);
          return { b: obj.b, key: this.keyOf(obj.b.entries[at]!.k), name };
        }
        const i = this.toNum(this.evalR(e.index));
        if (obj.t === 'str' && this.isLValue(e.object)) {
          const base = this.evalL(e.object);
          return { b: base.b, strOf: base, i, name };
        }
        const indexName = e.index.type === 'Num' ? undefined : (this.exprName(e.index) ?? 'index');
        if (obj.t === 'agg') return { b: obj.b, i, name, indexName };
        if (obj.t === 'ptr') return { b: this.deref(obj, name), i: obj.o + i, name, indexName };
        if (obj.t === 'str') throw new RuntimeErr('Unsupported', 'Unsupported feature', "Changing a single character of a std::string isn't supported yet.");
        throw new RuntimeErr('TypeError', 'Not indexable', `${name ?? 'This value'} can't be indexed with [].`);
      }
      case 'Member': {
        const name = this.exprName(e.object);
        let b: Block;
        if (e.arrow) {
          const p = this.evalR(e.object);
          if (p.t === 'iter') return this.iterMember(p, e.name);
          if (p.t !== 'ptr') throw new RuntimeErr('TypeError', 'Not a pointer', `'->' needs a pointer, but ${name ?? 'this'} is not one.`);
          b = this.deref(p, name);
        } else {
          const v = this.evalR(e.object);
          if (v.t !== 'agg') throw new RuntimeErr('TypeError', 'Not a struct', `${name ?? 'This value'} has no fields.`);
          b = v.b;
        }
        if (b.kind !== 'struct') throw new RuntimeErr('TypeError', 'Not a struct', `${name ?? 'This value'} has no field '${e.name}'.`);
        return { b, f: e.name, name: `${name ?? '?'}${e.arrow ? '->' : '.'}${e.name}` };
      }
      case 'Unary':
        if (e.op === '*') {
          const name = this.exprName(e.arg);
          const p = this.evalR(e.arg);
          if (p.t === 'siter') return { b: p.lv.b, strOf: p.lv, i: p.o };
          if (p.t === 'iter') {
            if (p.b.kind === 'set') return { b: p.b, i: p.o, name };
            const entry = p.b.entries[p.o];
            if (!entry) throw new RuntimeErr('OutOfRange', 'Invalid iterator', 'This iterator is end(), so it has no element.');
            const pair = (this.makeDefault({ ...INT_TYPE, base: 'pair', args: [p.b.elemType, p.b.valType ?? INT_TYPE] }, 'stack', this.ownerList()) as RV & { t: 'agg' }).b;
            pair.fields.set('first', entry.k);
            pair.fields.set('second', entry.v);
            return { b: pair, whole: true };
          }
          if (p.t !== 'ptr') throw new RuntimeErr('TypeError', 'Not a pointer', `Only pointers can be dereferenced with *.`);
          const b = this.deref(p, name);
          return b.kind === 'struct' ? { b, whole: true, name } : { b, i: p.o, name: name ? `*${name}` : undefined };
        }
        break;
      case 'Call': {
        const r = this.evalCall(e);
        if (r && 'b' in r && !('t' in r)) return r as LV;
        break;
      }
    }
    throw new RuntimeErr('TypeError', 'Not assignable', 'The left side of this assignment is not something that can be assigned to.');
  }

  /** it->first / it->second on a map iterator. */
  private iterMember(it: RV & { t: 'iter' }, field: string): LV {
    const entry = it.b.entries[it.o];
    if (it.b.kind !== 'map' || !entry) {
      throw new RuntimeErr('OutOfRange', 'Invalid iterator', 'This iterator is end() or not a map iterator, so it has no element.', 'Compare an iterator with end() before using it.');
    }
    if (field === 'second') return { b: it.b, key: this.keyOf(entry.k) };
    if (field !== 'first') throw new RuntimeErr('TypeError', 'Unknown member', `Map elements have first and second, not ${field}.`);
    const cell = this.alloc('scalar', 'stack', it.b.elemType, [entry.k]);
    this.ownerList().push(cell);
    return { b: cell, i: 0 };
  }

  /** Inside a member function, a bare field name means this->field. */
  private memberOfSelf(name: string): LV | undefined {
    const self = this.stack[this.stack.length - 1]?.self;
    if (self && !self.freed && self.fields.has(name)) return { b: self, f: name };
    return undefined;
  }

  private deref(p: RV & { t: 'ptr' }, name?: string): Block {
    if (!p.b) {
      throw new RuntimeErr(
        'NullDereference',
        'Null pointer dereference',
        `${name ? `'${name}'` : 'This pointer'} is null, so there is nothing to read or write through it.`,
        'The program followed a pointer that points to nothing (nullptr/NULL). Check that it was set before using it.',
        name ? [{ name, value: { k: 'ptr', id: null, offset: 0, t: typeName(p.ty), address: '0x0' } }] : []
      );
    }
    this.checkAlive(p.b, name);
    return p.b;
  }

  private exprName(e: Expr): string | undefined {
    if (e.type === 'Ident') return e.name;
    if (e.type === 'Member') return `${this.exprName(e.object) ?? '?'}${e.arrow ? '->' : '.'}${e.name}`;
    return undefined;
  }

  private isLValue(e: Expr): boolean {
    return e.type === 'Ident' || e.type === 'Index' || e.type === 'Member' || (e.type === 'Unary' && e.op === '*');
  }

  // ---- values ----

  private toNum(v: RV): number {
    switch (v.t) {
      case 'int':
      case 'float':
      case 'char':
        return v.v;
      case 'long':
        return Number(v.v);
      case 'bool':
        return v.v ? 1 : 0;
      case 'uninit':
        throw this.uninitError();
      case 'ptr':
        return v.b ? v.b.addr + v.o : 0;
    }
    throw new RuntimeErr('TypeError', 'Not a number', `Expected a number here.`);
  }

  private uninitError(name?: string) {
    return new RuntimeErr(
      'UninitializedRead',
      'Uninitialized variable',
      `${name ? `'${name}'` : 'A variable'} is used before it has been given a value.`,
      `${name ? `'${name}'` : 'This variable'} was declared without a value, so reading it gives garbage. Give it a value first.`,
      name ? [{ name, value: { k: 'uninit', t: '?' } }] : []
    );
  }

  private toBig(v: RV): bigint {
    if (v.t === 'long') return v.v;
    return BigInt(Math.trunc(this.toNum(v)));
  }

  private truthy(v: RV): boolean {
    if (v.t === 'ptr') return v.b !== null;
    if (v.t === 'str' || v.t === 'agg' || v.t === 'stream' || v.t === 'fn' || v.t === 'cmp') return true;
    return this.toNum(v) !== 0;
  }

  private coerce(v: RV, ty: TypeInfo): RV {
    if (v.t === 'uninit' || v.t === 'agg' || v.t === 'void' || v.t === 'stream' || v.t === 'manip' || v.t === 'fn' || v.t === 'iter' || v.t === 'siter' || v.t === 'cmp') return v;
    if (ty.ptr) {
      if (v.t === 'ptr') return { ...v, ty: this.pointee(ty) };
      if (v.t === 'str' && ty.base === 'char') return v;
      if (this.toNum(v) === 0) return { t: 'ptr', b: null, o: 0, ty: this.pointee(ty) };
      throw new RuntimeErr('TypeError', 'Type mismatch', `Cannot store a number in pointer type ${typeName(ty)}.`);
    }
    const b = ty.base;
    if (b === 'auto') return v;
    if (b === 'string') {
      if (v.t === 'str') return v;
      if (v.t === 'char') return { t: 'str', v: String.fromCharCode(v.v) };
      return v;
    }
    if (v.t === 'str' || v.t === 'ptr') return v;
    if (isWideBase(b)) {
      const big = v.t === 'float' ? BigInt(Math.trunc(v.v)) : this.toBig(v);
      return { t: 'long', v: ty.unsigned || b === 'size_t' ? BigInt.asUintN(64, big) : BigInt.asIntN(64, big) };
    }
    if (v.t === 'long' && (b === 'int' || b === 'short' || b === 'char' || b === 'bool')) {
      const low = Number(BigInt.asIntN(32, v.v));
      v = { t: 'int', v: low };
    }
    const n = this.toNum(v);
    if (b === 'bool') return { t: 'bool', v: n !== 0 };
    if (b === 'char') return { t: 'char', v: ((Math.trunc(n) % 256) + 256) % 256 };
    if (isFloatBase(b)) return { t: 'float', v: b === 'float' ? Math.fround(n) : n };
    if (isIntBase(b)) {
      const t = Math.trunc(n);
      if (b === 'short') return { t: 'int', v: ty.unsigned ? t & 0xffff : (t << 16) >> 16 };
      return { t: 'int', v: ty.unsigned ? t >>> 0 : t | 0 };
    }
    return v;
  }

  private evalR(e: Expr): RV {
    switch (e.type) {
      case 'Num':
        if (e.big) return { t: 'long', v: BigInt(e.big) };
        return e.float ? { t: 'float', v: e.value } : { t: 'int', v: e.value };
      case 'Str':
        return { t: 'str', v: e.value };
      case 'Char':
        return { t: 'char', v: e.value };
      case 'Bool':
        return { t: 'bool', v: e.value };
      case 'Null':
        return { t: 'ptr', b: null, o: 0, ty: { ...INT_TYPE, base: 'void' } };
      case 'Ident': {
        if (e.name === 'cout' || e.name === 'cin' || e.name === 'cerr') return { t: 'stream', name: e.name };
        if (['endl', 'fixed', 'boolalpha'].includes(e.name) && !this.lookup(e.name)) return { t: 'manip', name: e.name };
        if (e.name === 'INT_MAX') return { t: 'int', v: 2147483647 };
        if (e.name === 'INT_MIN') return { t: 'int', v: -2147483648 };
        if (e.name === 'npos' && !this.lookup(e.name)) return { t: 'int', v: -1 };
        if (!this.lookup(e.name) && !this.memberOfSelf(e.name)) {
          const fn = this.program.functions.get(e.name);
          if (fn) return { t: 'fn', fn, closure: [] }; // a function passed as a comparator
        }
        if (e.name === 'LLONG_MAX') return { t: 'long', v: 9223372036854775807n };
        if (e.name === 'LLONG_MIN') return { t: 'long', v: -9223372036854775808n };
        const lv = this.evalL(e);
        const v = this.read(lv);
        if (v.t === 'uninit') throw this.uninitError(e.name);
        return v;
      }
      case 'Index': {
        const obj = this.evalR(e.object);
        if (obj.t === 'str') {
          const i = this.toNum(this.evalR(e.index));
          if (i < 0 || i > obj.v.length) this.checkBounds(obj.v.length, i, this.exprName(e.object));
          return { t: 'char', v: obj.v.charCodeAt(i) || 0 };
        }
        const v = this.read(this.evalL(e));
        if (v.t === 'uninit') throw this.uninitError(this.exprName(e.object) ? `${this.exprName(e.object)}[${this.toNum(this.evalR(e.index))}]` : undefined);
        return v;
      }
      case 'Member': {
        const lv = this.evalL(e);
        const v = this.read(lv);
        if (v.t === 'uninit') throw this.uninitError(lv.name);
        return v;
      }
      case 'Unary':
        return this.evalUnary(e);
      case 'Update': {
        const lv = this.evalL(e.arg);
        const old = this.read(lv);
        if (old.t === 'uninit') throw this.uninitError(lv.name);
        const delta = e.op === '++' ? 1 : -1;
        const next = old.t === 'ptr' || old.t === 'iter' || old.t === 'siter' ? { ...old, o: old.o + delta } : this.arith('+', old, { t: 'int', v: delta });
        this.write(lv, next);
        return e.prefix ? this.read(lv) : old;
      }
      case 'Binary':
        return this.evalBinary(e);
      case 'Logical': {
        const l = this.truthy(this.evalR(e.left));
        if (e.op === '&&' ? !l : l) return { t: 'bool', v: l };
        return { t: 'bool', v: this.truthy(this.evalR(e.right)) };
      }
      case 'Assign':
        return this.evalAssign(e);
      case 'Ternary':
        return this.truthy(this.evalR(e.test)) ? this.evalR(e.then) : this.evalR(e.else);
      case 'Call': {
        const r = this.evalCall(e);
        if (r && 'b' in r && !('t' in r)) return this.read(r as LV);
        return (r as RV) ?? { t: 'void' };
      }
      case 'Cast': {
        const v = this.evalR(e.arg);
        if (v.t === 'ptr' && e.to.ptr && v.b && v.b.elemType.base === 'byte') this.retype(v.b, this.pointee(e.to));
        return this.coerce(v, e.to);
      }
      case 'SizeofType':
        return { t: 'int', v: sizeOf(e.of, this.program.structs) };
      case 'New':
        return this.evalNew(e);
      case 'Comma': {
        let last: RV = { t: 'void' };
        for (const item of e.items) last = this.evalR(item);
        return last;
      }
      case 'InitList':
        throw new RuntimeErr('TypeError', 'Unexpected initializer list', 'A { ... } list can only be used to initialize a variable.');
      case 'Lambda': {
        const frame = this.stack[this.stack.length - 1];
        const fn: FunctionDef = { name: 'lambda', returnType: { ...INT_TYPE, base: 'auto' }, params: e.params, body: e.body, line: e.line };
        return { t: 'fn', fn, closure: frame ? [...(frame.closure ?? []), ...frame.scopes] : [], self: frame?.self };
      }
      case 'Construct':
        return this.constructTemp(e.of, e.args, e.brace);
    }
  }

  private evalUnary(e: Expr & { type: 'Unary' }): RV {
    switch (e.op) {
      case '&': {
        const lv = this.evalL(e.arg);
        if ('whole' in lv) return { t: 'ptr', b: lv.b, o: 0, ty: lv.b.kind === 'struct' ? { ...INT_TYPE, base: lv.b.struct!.name } : lv.b.elemType };
        if ('key' in lv || 'strOf' in lv) throw new RuntimeErr('Unsupported', 'Unsupported feature', 'Taking the address of a map value or string character is not supported yet.');
        if ('f' in lv) {
          const fv = lv.b.fields.get(lv.f);
          if (fv?.t === 'agg') return { t: 'ptr', b: fv.b, o: 0, ty: fv.b.elemType };
          throw new RuntimeErr('Unsupported', 'Unsupported feature', 'Taking the address of a single struct field is not supported yet.');
        }
        return { t: 'ptr', b: lv.b, o: lv.i, ty: lv.b.elemType };
      }
      case '*': {
        const lv = this.evalL(e);
        const v = this.read(lv);
        if (v.t === 'uninit') throw this.uninitError(lv.name);
        return v;
      }
      case '!':
        return { t: 'bool', v: !this.truthy(this.evalR(e.arg)) };
      case '-': {
        const v = this.evalR(e.arg);
        if (v.t === 'long') return { t: 'long', v: BigInt.asIntN(64, -v.v) };
        return v.t === 'float' ? { t: 'float', v: -v.v } : { t: 'int', v: -this.toNum(v) | 0 };
      }
      case '+':
        return this.evalR(e.arg);
      case '~': {
        const v = this.evalR(e.arg);
        return v.t === 'long' ? { t: 'long', v: BigInt.asIntN(64, ~v.v) } : { t: 'int', v: ~this.toNum(v) };
      }
      case 'sizeof': {
        const v = this.evalR(e.arg);
        if (v.t === 'agg' && v.b.kind === 'array') return { t: 'int', v: v.b.items.length * sizeOf(v.b.elemType, this.program.structs) };
        if (v.t === 'float' || v.t === 'long') return { t: 'int', v: 8 };
        if (v.t === 'char' || v.t === 'bool') return { t: 'int', v: 1 };
        if (v.t === 'ptr') return { t: 'int', v: 8 };
        return { t: 'int', v: 4 };
      }
    }
    throw new RuntimeErr('TypeError', 'Unknown operator', `Unknown operator ${e.op}`);
  }

  private evalBinary(e: Expr & { type: 'Binary' }): RV {
    const left = this.evalR(e.left);
    if (left.t === 'stream') return this.streamOp(left, e.op, e.right);
    return this.arith(e.op, left, this.evalR(e.right));
  }

  private arith(op: string, a: RV, b: RV): RV {
    if ((a.t === 'iter' || a.t === 'siter') && (b.t === 'iter' || b.t === 'siter')) {
      const same = (a.t === 'iter' ? a.b : a.lv.b) === (b.t === 'iter' ? b.b : b.lv.b);
      if (op === '==') return { t: 'bool', v: same && a.o === b.o };
      if (op === '!=') return { t: 'bool', v: !(same && a.o === b.o) };
      if (op === '-') return { t: 'int', v: a.o - b.o };
    }
    if ((a.t === 'iter' || a.t === 'siter') && (op === '+' || op === '-')) return { ...a, o: a.o + (op === '+' ? 1 : -1) * this.toNum(b) };
    if (a.t === 'agg' && b.t === 'agg' && (a.b.kind !== 'array' || b.b.kind !== 'array')) {
      // pairs, vectors and strings-of-structs compare element by element
      const c = this.compareRV(a, b);
      const results: Record<string, boolean> = { '<': c < 0, '>': c > 0, '<=': c <= 0, '>=': c >= 0, '==': c === 0, '!=': c !== 0 };
      if (op in results) return { t: 'bool', v: results[op]! };
    }
    // Pointers: arithmetic moves the offset; comparison uses identity.
    if (a.t === 'agg' && a.b.kind === 'array') a = { t: 'ptr', b: a.b, o: 0, ty: a.b.elemType };
    if (b.t === 'agg' && b.b.kind === 'array') b = { t: 'ptr', b: b.b, o: 0, ty: b.b.elemType };
    if (a.t === 'ptr' || b.t === 'ptr') {
      if (a.t === 'ptr' && b.t === 'ptr') {
        const same = a.b === b.b;
        switch (op) {
          case '==':
            return { t: 'bool', v: same && (a.b === null || a.o === b.o) };
          case '!=':
            return { t: 'bool', v: !(same && (a.b === null || a.o === b.o)) };
          case '-':
            return { t: 'int', v: a.o - b.o };
          case '<':
            return { t: 'bool', v: a.o < b.o };
          case '>':
            return { t: 'bool', v: a.o > b.o };
          case '<=':
            return { t: 'bool', v: a.o <= b.o };
          case '>=':
            return { t: 'bool', v: a.o >= b.o };
        }
      }
      const [p, n] = a.t === 'ptr' ? [a, b] : [b as RV & { t: 'ptr' }, a];
      if (op === '+') return { ...p, o: p.o + this.toNum(n) };
      if (op === '-' && a.t === 'ptr') return { ...p, o: p.o - this.toNum(n) };
      if (op === '==' || op === '!=') {
        const isNull = p.b === null && this.toNum(n) === 0;
        return { t: 'bool', v: op === '==' ? isNull : !isNull };
      }
      throw new RuntimeErr('TypeError', 'Invalid pointer arithmetic', `Can't use '${op}' with a pointer.`);
    }

    if (a.t === 'str' || b.t === 'str') {
      const s = (v: RV) => (v.t === 'str' ? v.v : v.t === 'char' ? String.fromCharCode(v.v) : String(this.toNum(v)));
      switch (op) {
        case '+':
          return { t: 'str', v: s(a) + s(b) };
        case '==':
          return { t: 'bool', v: s(a) === s(b) };
        case '!=':
          return { t: 'bool', v: s(a) !== s(b) };
        case '<':
          return { t: 'bool', v: s(a) < s(b) };
        case '>':
          return { t: 'bool', v: s(a) > s(b) };
        case '<=':
          return { t: 'bool', v: s(a) <= s(b) };
        case '>=':
          return { t: 'bool', v: s(a) >= s(b) };
      }
      throw new RuntimeErr('TypeError', 'Invalid string operation', `Can't use '${op}' with strings.`);
    }

    const float = a.t === 'float' || b.t === 'float';
    if (!float && (a.t === 'long' || b.t === 'long')) return this.arith64(op, this.toBig(a), this.toBig(b));

    const x = this.toNum(a);
    const y = this.toNum(b);
    // int arithmetic wraps at 32 bits, like the two's-complement hardware it models.
    const num = (v: number): RV => (float ? { t: 'float', v } : { t: 'int', v: v | 0 });
    switch (op) {
      case '+':
        return num(x + y);
      case '-':
        return num(x - y);
      case '*':
        return float ? num(x * y) : num(Math.imul(x, y));
      case '/':
        if (!float && y === 0) throw this.divError();
        return float ? num(x / y) : num(Math.trunc(x / y));
      case '%':
        if (y === 0) throw this.divError();
        return num(x % y);
      case '<':
        return { t: 'bool', v: x < y };
      case '>':
        return { t: 'bool', v: x > y };
      case '<=':
        return { t: 'bool', v: x <= y };
      case '>=':
        return { t: 'bool', v: x >= y };
      case '==':
        return { t: 'bool', v: x === y };
      case '!=':
        return { t: 'bool', v: x !== y };
      case '&':
        return { t: 'int', v: x & y };
      case '|':
        return { t: 'int', v: x | y };
      case '^':
        return { t: 'int', v: x ^ y };
      case '<<':
        return { t: 'int', v: x << y };
      case '>>':
        return { t: 'int', v: x >> y };
    }
    throw new RuntimeErr('TypeError', 'Unknown operator', `Unknown operator ${op}`);
  }

  /** long / long long arithmetic on BigInt, wrapping at 64 bits. */
  private arith64(op: string, x: bigint, y: bigint): RV {
    const wrap = (v: bigint): RV => ({ t: 'long', v: BigInt.asIntN(64, v) });
    switch (op) {
      case '+':
        return wrap(x + y);
      case '-':
        return wrap(x - y);
      case '*':
        return wrap(x * y);
      case '/':
        if (y === 0n) throw this.divError();
        return wrap(x / y); // BigInt division truncates toward zero, like C
      case '%':
        if (y === 0n) throw this.divError();
        return wrap(x % y);
      case '<':
        return { t: 'bool', v: x < y };
      case '>':
        return { t: 'bool', v: x > y };
      case '<=':
        return { t: 'bool', v: x <= y };
      case '>=':
        return { t: 'bool', v: x >= y };
      case '==':
        return { t: 'bool', v: x === y };
      case '!=':
        return { t: 'bool', v: x !== y };
      case '&':
        return wrap(x & y);
      case '|':
        return wrap(x | y);
      case '^':
        return wrap(x ^ y);
      case '<<':
        return wrap(x << y);
      case '>>':
        return wrap(x >> y);
    }
    throw new RuntimeErr('TypeError', 'Unknown operator', `Unknown operator ${op}`);
  }

  private divError() {
    return new RuntimeErr('DivisionByZero', 'Division by zero', 'Integer division by zero.', 'The program divided by zero, which has no answer for integers. Check the divisor before dividing.');
  }

  private evalAssign(e: Expr & { type: 'Assign' }): RV {
    const lv = this.evalL(e.target);
    let value: RV;
    if (e.value.type === 'InitList') {
      const cur = this.read(lv);
      if (cur.t !== 'agg') throw new RuntimeErr('TypeError', 'Unexpected initializer list', 'Only arrays, structs and containers can be assigned a { ... } list.');
      this.fillFromList(cur.b, e.value.items);
      return cur;
    }
    if (e.op === '=') {
      value = this.evalR(e.value);
    } else {
      const cur = this.read(lv);
      if (cur.t === 'uninit') throw this.uninitError(lv.name);
      value = this.arith(e.op.slice(0, -1), cur, this.evalR(e.value));
    }
    this.write(lv, value);
    return this.read(lv);
  }

  private evalNew(e: Expr & { type: 'New' }): RV {
    const ty = e.of;
    if (e.count) {
      const n = this.toNum(this.evalR(e.count));
      if (n < 0) throw new RuntimeErr('BadAlloc', 'Invalid allocation size', `new[] was asked for ${n} elements.`);
      const items = Array.from({ length: n }, (_, i) => (e.args?.[i] ? this.coerce(this.evalR(e.args[i]!), ty) : this.makeDefault(ty, 'heap', null)));
      const b = this.alloc('array', 'heap', ty, items);
      return { t: 'ptr', b, o: 0, ty };
    }
    const def = this.program.structs.get(ty.base);
    if (def && !ty.ptr) {
      const b = this.construct(def, e.args ?? [], 'heap', null, e.line);
      return { t: 'ptr', b, o: 0, ty };
    }
    const init = e.args?.[0] ? this.coerce(this.evalR(e.args[0]), ty) : e.args ? this.makeDefault(ty, 'heap', null, true) : this.makeDefault(ty, 'heap', null);
    const b = this.alloc('scalar', 'heap', ty, [init]);
    return { t: 'ptr', b, o: 0, ty };
  }

  /** Gives raw malloc/calloc bytes their type once a cast or typed pointer says what they hold. */
  private retype(b: Block, ty: TypeInfo) {
    const bytes = b.items.length;
    const zero = b.items[0]?.t === 'int'; // calloc
    const n = Math.max(1, Math.floor(bytes / sizeOf(ty, this.program.structs)));
    const def = !ty.ptr ? this.program.structs.get(ty.base) : undefined;
    if (def && n === 1) {
      // One struct: the block itself becomes the struct, so p->field works.
      const fresh = (this.makeDefault(ty, 'heap', null, zero) as RV & { t: 'agg' }).b;
      this.blocks.delete(fresh.id);
      b.kind = 'struct';
      b.struct = def;
      b.elemType = ty;
      b.items = [];
      b.fields = fresh.fields;
      return;
    }
    b.elemType = ty;
    b.kind = 'array';
    b.items = Array.from({ length: n }, () => (def ? this.makeDefault(ty, 'heap', null, zero) : zero ? this.coerce({ t: 'int', v: 0 }, ty) : { t: 'uninit', ty }));
  }

  /** Fills an array, struct or container from a { ... } list. */
  private fillFromList(b: Block, items: Expr[]) {
    const val = (e: Expr, ty: TypeInfo): RV => {
      if (e.type === 'InitList') {
        const d = this.makeDefault(ty, b.region, this.ownerList(), true);
        if (d.t === 'agg') this.fillFromList(d.b, e.items);
        return d;
      }
      const v = this.evalR(e);
      if (v.t === 'agg') return { t: 'agg', b: this.copyAgg(v.b, b.region, this.ownerList()) };
      return this.coerce(v, ty);
    };
    if (b.kind === 'struct') {
      const fields = b.struct!.fields;
      fields.forEach((f, i) => {
        if (i < items.length) b.fields.set(f.name, val(items[i]!, f.type));
        else if (b.fields.get(f.name)?.t === 'uninit') b.fields.set(f.name, this.makeDefault(f.type, b.region, null, true));
      });
      return;
    }
    if (b.kind === 'array' && b.items[0]?.t === 'agg' && b.items[0].b.kind === 'array') {
      // 2-D: {{1, 2}, {3, 4}} row by row, or {1, 2, 3, 4} filled in row-major order.
      const rows = b.items.map((r) => (r as RV & { t: 'agg' }).b);
      if (items.every((it) => it.type === 'InitList')) {
        if (items.length > rows.length) throw new RuntimeErr('OutOfBounds', 'Too many initializers', `The list has ${items.length} rows but the array only has ${rows.length}.`);
        rows.forEach((row, r) => this.fillFromList(row, items[r] ? (items[r] as Expr & { type: 'InitList' }).items : []));
      } else {
        const width = rows[0]!.items.length;
        rows.forEach((row, r) => this.fillFromList(row, items.slice(r * width, (r + 1) * width)));
      }
      return;
    }
    if (b.kind === 'array') {
      if (items.length > b.items.length) throw new RuntimeErr('OutOfBounds', 'Too many initializers', `The list has ${items.length} values but the array only has room for ${b.items.length}.`);
      for (let i = 0; i < b.items.length; i++) b.items[i] = i < items.length ? val(items[i]!, b.elemType) : this.makeDefault(b.elemType, b.region, null, true);
      return;
    }
    if (b.kind === 'map') {
      b.entries = [];
      for (const it of items) {
        if (it.type !== 'InitList' || it.items.length !== 2) throw new RuntimeErr('TypeError', 'Invalid map initializer', 'Each map entry needs {key, value}.');
        this.mapPut(b, this.evalAs(it.items[0]!, b.elemType), this.evalAs(it.items[1]!, b.valType ?? INT_TYPE), true);
      }
      return;
    }
    if (b.kind === 'set' || b.kind === 'pq') {
      b.items = [];
      for (const it of items) {
        const v = val(it, b.elemType);
        if (b.kind === 'set') this.setPut(b, v);
        else this.pqPush(b, v);
      }
      return;
    }
    b.items = items.map((it) => val(it, b.elemType));
  }

  // ---- calls ----

  private evalCall(e: Expr & { type: 'Call' }): RV | LV {
    if (e.callee.type === 'Member') return this.callMethod(e.callee, e.args);
    if (e.callee.type !== 'Ident') throw new RuntimeErr('TypeError', 'Not callable', 'This expression is not a function.');
    const name = e.callee.name;
    const fn = this.program.functions.get(name);
    if (fn) return this.callFunction(fn, this.evalArgs(fn, e.args), e.line);
    // Node(1, 2) or Node{1, 2}: a temporary object.
    const def = this.program.structs.get(name);
    if (def) return { t: 'agg', b: this.construct(def, e.args, 'stack', this.ownerList(), e.line) };
    // Inside a member function, helper() means this->helper().
    const self = this.stack[this.stack.length - 1]?.self;
    const method = self?.struct ? this.findMethod(self.struct, name, e.args.length) : undefined;
    if (method && self) return this.callFunction(method, this.evalArgs(method, e.args), e.line, self);
    // A variable holding a lambda: auto cmp = [](...){...}; function<int(int)> dfs = ...
    const held = this.lookup(name);
    if (held) {
      const v = this.read(held);
      if (v.t === 'fn') return this.callFunction(v.fn, this.evalArgs(v.fn, e.args), e.line, v.self, v.closure);
      if (v.t === 'cmp') {
        const [x, y] = e.args.map((a) => this.evalR(a));
        return { t: 'bool', v: this.lessThan(x!, y!, v) };
      }
    }
    return this.builtin(name, e.args);
  }

  private evalArgs(fn: FunctionDef, argExprs: Expr[]): (RV | LV)[] {
    const label = fn.owner ? `${fn.owner}::${fn.name}` : fn.name;
    if (argExprs.length > fn.params.length) {
      throw new RuntimeErr('TypeError', 'Too many arguments', `${label}() takes ${fn.params.length} arguments but got ${argExprs.length}.`);
    }
    return fn.params.map((p, i) => {
      const a = argExprs[i];
      if (!a) throw new RuntimeErr('TypeError', 'Missing argument', `${label}() needs ${fn.params.length} arguments but got ${argExprs.length}.`);
      if (p.type.ref && this.isLValue(a)) return this.evalL(a);
      return this.evalAs(a, p.type);
    });
  }

  private findMethod(def: StructDef, name: string, arity: number): FunctionDef | undefined {
    const list = def.methods.get(name);
    return list?.find((m) => m.params.length === arity) ?? (list?.length === 1 ? list[0] : undefined);
  }

  /**
   * Creates a struct/class object: default fields, then the matching
   * constructor (with its initializer list), or aggregate initialization
   * from the arguments when the type has no constructors.
   */
  private construct(def: StructDef, argExprs: Expr[], region: Block['region'], owner: Block[] | null, line: number): Block {
    const b = (this.makeDefault({ ...INT_TYPE, base: def.name }, region, owner) as RV & { t: 'agg' }).b;
    const ctors = def.methods.get(def.name);
    if (ctors?.length) {
      const ctor = ctors.find((c) => c.params.length === argExprs.length);
      if (!ctor) {
        throw new RuntimeErr('TypeError', 'No matching constructor', `${def.name} has no constructor that takes ${argExprs.length} argument${argExprs.length === 1 ? '' : 's'}.`);
      }
      this.callFunction(ctor, this.evalArgs(ctor, argExprs), line, b);
    } else if (argExprs.length) {
      this.fillFromList(b, argExprs);
    }
    return b;
  }

  private callFunction(fn: FunctionDef, args: (RV | LV)[], callLine: number, self?: Block, closure?: Scope[]): RV {
    if (this.stack.length >= 256) {
      throw new RuntimeErr('StackOverflow', 'Stack overflow', `Too many nested calls (over 256). ${fn.name}() keeps calling itself.`, 'The recursion never reached a base case, so calls kept piling up until the stack ran out of room.');
    }
    const caller = this.stack[this.stack.length - 1];
    if (caller) caller.line = callLine;
    const scope: Scope = { vars: new Map(), owned: [] };
    const frame: CallFrame = {
      id: `f${this.stack.length}`,
      name: fn.owner ? `${fn.owner}::${fn.name}` : fn.name,
      line: fn.line,
      scopes: [scope],
      self,
      closure,
      returnType: fn.returnType,
    };
    if (self) {
      const thisCell = this.alloc('scalar', 'stack', { ...INT_TYPE, base: self.struct!.name, ptr: 1 }, [{ t: 'ptr', b: self, o: 0, ty: { ...INT_TYPE, base: self.struct!.name } }], undefined, 'this');
      scope.owned.push(thisCell);
      scope.vars.set('this', { b: thisCell, i: 0 });
    }

    // Evaluate parameter storage before pushing, so it belongs to the callee.
    const bindings: [string, LV][] = fn.params.map((p, i) => {
      const a = args[i]!;
      if (!('t' in a)) return [p.name, a];
      if (a.t === 'agg' && !p.type.ptr) {
        const copy = this.copyAgg(a.b, 'stack', scope.owned);
        return [p.name, { b: copy, whole: true }];
      }
      const v = a.t === 'agg' && a.b.kind === 'array' ? ({ t: 'ptr', b: a.b, o: 0, ty: a.b.elemType } as RV) : a;
      const b = this.alloc('scalar', 'stack', p.type, [this.coerce(v, p.type)], undefined, p.name);
      scope.owned.push(b);
      return [p.name, { b, i: 0 }];
    });
    for (const [n, lv] of bindings) scope.vars.set(n, lv);

    this.stack.push(frame);
    // On an error the frame is left on the stack, so the exception step shows it.
    let result: RV = { t: 'void' };
    this.record(fn.line, 'call');
    try {
      for (const init of fn.inits ?? []) this.runInitializer(self!, init.name, init.args, fn.line);
      this.execBlockBody(fn.body.body, frame);
      frame.line = fn.body.endLine;
    } catch (sig) {
      if (!(sig instanceof ReturnSignal)) throw sig;
      result = sig.value;
    }
    if (fn.returnType.base !== 'void' || fn.returnType.ptr) {
      if (result.t === 'void' && fn.name === 'main') result = { t: 'int', v: 0 };
      result = result.t === 'agg' ? { t: 'agg', b: this.copyAgg(result.b, 'stack', caller ? caller.scopes[caller.scopes.length - 1]!.owned : null) } : this.coerce(result, fn.returnType);
    }
    frame.returnValue = result;
    this.record(frame.line, 'return');
    this.stack.pop();
    for (const s of frame.scopes) this.releaseScope(s);
    return result;
  }

  /** One entry of a constructor initializer list: val(v) or child(nullptr). */
  private runInitializer(self: Block, field: string, argExprs: Expr[], line: number) {
    const slot = self.struct!.fields.find((f) => f.name === field);
    if (!slot) throw new RuntimeErr('UnknownField', 'Unknown field', `'${self.struct!.name}' has no field named '${field}' to initialize.`);
    const nested = !slot.type.ptr ? this.program.structs.get(slot.type.base) : undefined;
    if (nested && slot.arraySize === undefined) {
      const obj = this.construct(nested, argExprs, self.region, this.ownerList(), line);
      self.fields.set(field, { t: 'agg', b: obj });
      return;
    }
    const cur = self.fields.get(field);
    if (cur?.t === 'agg' && argExprs.length > 1 && cur.b.kind === 'vector') {
      const [n, fill] = argExprs.map((a) => this.evalR(a));
      cur.b.items = Array.from({ length: this.toNum(n!) }, () => (fill ? this.coerce(fill, cur.b.elemType) : this.makeDefault(cur.b.elemType, 'heap', null, true)));
      return;
    }
    if (argExprs.length) this.write({ b: self, f: field }, this.evalR(argExprs[0]!));
  }

  private callMethod(m: Expr & { type: 'Member' }, argExprs: Expr[]): RV | LV {
    // User-defined member functions: obj.method() and ptr->method().
    const target = m.arrow ? this.evalR(m.object) : this.evalR(m.object);
    const objBlock = target.t === 'ptr' && m.arrow ? this.deref(target, this.exprName(m.object)) : target.t === 'agg' ? target.b : undefined;
    if (objBlock?.kind === 'struct') {
      const method = this.findMethod(objBlock.struct!, m.name, argExprs.length);
      if (!method) throw new RuntimeErr('TypeError', 'Unknown method', `'${objBlock.struct!.name}' has no member function '${m.name}' that takes ${argExprs.length} argument${argExprs.length === 1 ? '' : 's'}.`);
      return this.callFunction(method, this.evalArgs(method, argExprs), m.line, objBlock);
    }
    const objV = m.arrow && target.t === 'ptr' && objBlock ? ({ t: 'agg', b: objBlock } as RV) : target;
    const name = this.exprName(m.object);
    const args = () => argExprs.map((a) => this.evalR(a));
    if (objV.t === 'str') return this.stringMethod(objV.v, m, argExprs);
    if (objV.t !== 'agg' || objV.b.kind === 'struct' || objV.b.kind === 'array') {
      throw new RuntimeErr('Unsupported', 'Unsupported method', `${name ?? 'This value'} has no method ${m.name}().`);
    }
    const b = objV.b;
    const labels: Partial<Record<BlockKind, string>> = { cpp_stack: 'stack', cpp_queue: 'queue', deque: 'deque', map: 'map', set: 'set', pq: 'priority_queue' };
    const kindLabel = labels[b.kind] ?? 'vector';
    const empty = (what: string) =>
      new RuntimeErr('EmptyContainer', `${what} on an empty ${kindLabel}`, `${name ?? kindLabel}.${what} was called, but ${name ?? `the ${kindLabel}`} is empty.`, `There is nothing in ${name ? `'${name}'` : `the ${kindLabel}`} to ${what.replace('()', '')}. Check empty() first.`);
    const arg = (i: number, type: TypeInfo) => this.evalAs(argExprs[i]!, type, null);
    const size = b.kind === 'map' ? b.entries.length : b.items.length;

    switch (m.name) {
      case 'size':
        return { t: 'int', v: size };
      case 'empty':
        return { t: 'bool', v: size === 0 };
      case 'clear':
        b.items = [];
        b.entries = [];
        return { t: 'void' };
    }

    if (b.kind === 'map') {
      const keyArg = () => this.coerce(arg(0, b.elemType), b.elemType);
      switch (m.name) {
        case 'count':
        case 'contains': {
          const found = this.mapFind(b, this.keyOf(keyArg())) >= 0;
          return m.name === 'count' ? { t: 'int', v: found ? 1 : 0 } : { t: 'bool', v: found };
        }
        case 'find': {
          const at = this.mapFind(b, this.keyOf(keyArg()));
          return { t: 'iter', b, o: at < 0 ? b.entries.length : at };
        }
        case 'begin':
          return { t: 'iter', b, o: 0 };
        case 'end':
          return { t: 'iter', b, o: b.entries.length };
        case 'rbegin':
          return { t: 'iter', b, o: b.entries.length - 1 };
        case 'at': {
          const k = keyArg();
          if (this.mapFind(b, this.keyOf(k)) < 0) {
            throw new RuntimeErr('OutOfRange', 'Key not found', `${name ?? 'The map'}.at() was called with a key that isn't in the map.`, 'at() throws std::out_of_range for a missing key. Use count() or find() to check first.');
          }
          return { b, key: this.keyOf(k), name };
        }
        case 'erase': {
          const first = this.evalR(argExprs[0]!);
          const at = first.t === 'iter' ? first.o : this.mapFind(b, this.keyOf(this.coerce(first, b.elemType)));
          if (at >= 0 && at < b.entries.length) b.entries.splice(at, 1);
          return { t: 'int', v: at >= 0 ? 1 : 0 };
        }
        case 'insert':
        case 'emplace': {
          let k: RV, v: RV;
          if (argExprs.length === 2) {
            k = arg(0, b.elemType);
            v = arg(1, b.valType ?? INT_TYPE);
          } else {
            const p = arg(0, { ...INT_TYPE, base: 'pair', args: [b.elemType, b.valType ?? INT_TYPE] });
            if (p.t !== 'agg' || p.b.kind !== 'struct') throw new RuntimeErr('TypeError', 'Invalid insert', 'map.insert() needs a {key, value} pair.');
            k = p.b.fields.get('first')!;
            v = p.b.fields.get('second')!;
          }
          const before = b.entries.length;
          this.mapPut(b, k, v, false);
          return { t: 'bool', v: b.entries.length > before };
        }
      }
    }

    if (b.kind === 'set') {
      const valArg = () => this.coerce(arg(0, b.elemType), b.elemType);
      const findAt = (v: RV) => b.items.findIndex((x) => this.keyOf(x) === this.keyOf(v));
      switch (m.name) {
        case 'insert':
        case 'emplace':
          return { t: 'bool', v: this.setPut(b, valArg()) };
        case 'count':
          return { t: 'int', v: findAt(valArg()) >= 0 ? 1 : 0 };
        case 'contains':
          return { t: 'bool', v: findAt(valArg()) >= 0 };
        case 'find': {
          const at = findAt(valArg());
          return { t: 'iter', b, o: at < 0 ? b.items.length : at };
        }
        case 'erase': {
          const first = this.evalR(argExprs[0]!);
          const at = first.t === 'iter' ? first.o : findAt(this.coerce(first, b.elemType));
          if (at >= 0 && at < b.items.length) b.items.splice(at, 1);
          return { t: 'int', v: at >= 0 ? 1 : 0 };
        }
        case 'begin':
          return { t: 'iter', b, o: 0 };
        case 'end':
          return { t: 'iter', b, o: b.items.length };
        case 'rbegin':
          return { t: 'iter', b, o: b.items.length - 1 };
      }
    }

    if (b.kind === 'pq') {
      switch (m.name) {
        case 'push':
        case 'emplace':
          this.pqPush(b, arg(0, b.elemType));
          return { t: 'void' };
        case 'pop':
          if (!b.items.length) throw empty('pop()');
          this.pqPop(b);
          return { t: 'void' };
        case 'top':
          if (!b.items.length) throw empty('top()');
          return { b, i: 0, name };
      }
    }

    // vector, deque, stack and queue keep plain items.
    const push = () => {
      b.items.push(this.stored(arg(0, b.elemType), b.elemType));
      return { t: 'void' } as RV;
    };
    const lastOf = (what: string): LV => {
      if (!b.items.length) throw empty(what);
      return { b, i: b.items.length - 1, name };
    };
    const firstOf = (what: string): LV => {
      if (!b.items.length) throw empty(what);
      return { b, i: 0, name };
    };

    if (b.kind === 'vector' || b.kind === 'deque') {
      switch (m.name) {
        case 'push_back':
        case 'emplace_back':
          return push();
        case 'push_front':
        case 'emplace_front':
          if (b.kind !== 'deque') break;
          b.items.unshift(this.stored(arg(0, b.elemType), b.elemType));
          return { t: 'void' };
        case 'pop_back':
          if (!b.items.length) throw empty('pop_back()');
          b.items.pop();
          return { t: 'void' };
        case 'pop_front':
          if (b.kind !== 'deque') break;
          if (!b.items.length) throw empty('pop_front()');
          b.items.shift();
          return { t: 'void' };
        case 'back':
          return lastOf('back()');
        case 'front':
          return firstOf('front()');
        case 'at':
          return { b, i: this.toNum(args()[0]!), name };
        case 'begin':
          return { t: 'ptr', b, o: 0, ty: b.elemType };
        case 'end':
          return { t: 'ptr', b, o: b.items.length, ty: b.elemType };
        case 'resize': {
          const count = this.toNum(this.evalR(argExprs[0]!));
          const fill = argExprs[1] ? arg(1, b.elemType) : undefined;
          while (b.items.length > count) b.items.pop();
          while (b.items.length < count) b.items.push(fill ? this.stored(fill, b.elemType) : this.makeDefault(b.elemType, 'heap', null, true));
          return { t: 'void' };
        }
        case 'assign': {
          const count = this.toNum(this.evalR(argExprs[0]!));
          const fill = arg(1, b.elemType);
          b.items = Array.from({ length: count }, () => this.stored(fill, b.elemType));
          return { t: 'void' };
        }
        case 'insert': {
          const at = this.evalR(argExprs[0]!);
          if (at.t !== 'ptr' || at.b !== b) throw new RuntimeErr('TypeError', 'Invalid insert', 'insert() needs a position like v.begin() + i.');
          if (at.o < 0 || at.o > b.items.length) this.checkBounds(b.items.length + 1, at.o, name);
          b.items.splice(at.o, 0, this.stored(arg(argExprs.length - 1, b.elemType), b.elemType));
          return { t: 'ptr', b, o: at.o, ty: b.elemType };
        }
        case 'erase': {
          const from = this.evalR(argExprs[0]!);
          const to = argExprs[1] ? this.evalR(argExprs[1]) : undefined;
          if (from.t !== 'ptr' || from.b !== b) throw new RuntimeErr('TypeError', 'Invalid erase', 'erase() needs a position like v.begin() + i.');
          const end = to?.t === 'ptr' ? to.o : from.o + 1;
          this.checkBounds(b.items.length, from.o, name);
          b.items.splice(from.o, Math.max(0, end - from.o));
          return { t: 'ptr', b, o: from.o, ty: b.elemType };
        }
      }
    }
    if (b.kind === 'cpp_stack') {
      switch (m.name) {
        case 'push':
        case 'emplace':
          return push();
        case 'pop':
          if (!b.items.length) throw empty('pop()');
          b.items.pop();
          return { t: 'void' };
        case 'top':
          return lastOf('top()');
      }
    }
    if (b.kind === 'cpp_queue') {
      switch (m.name) {
        case 'push':
        case 'emplace':
          return push();
        case 'pop':
          if (!b.items.length) throw empty('pop()');
          b.items.shift();
          return { t: 'void' };
        case 'front':
          return firstOf('front()');
        case 'back':
          return lastOf('back()');
      }
    }
    throw new RuntimeErr('Unsupported', 'Unsupported method', `std::${kindLabel}.${m.name}() isn't supported yet.`);
  }

  private stringMethod(s: string, m: Expr & { type: 'Member' }, argExprs: Expr[]): RV | LV {
    const args = () => argExprs.map((a) => this.evalR(a));
    const self = () => this.evalL(m.object);
    const text = (v: RV) => (v.t === 'char' ? String.fromCharCode(v.v) : v.t === 'str' ? v.v : '');
    switch (m.name) {
      case 'size':
      case 'length':
        return { t: 'int', v: s.length };
      case 'empty':
        return { t: 'bool', v: s.length === 0 };
      case 'substr': {
        const [pos, len] = args().map((v) => this.toNum(v));
        if ((pos ?? 0) > s.length) this.checkBounds(s.length + 1, pos!, this.exprName(m.object));
        return { t: 'str', v: s.substr(pos ?? 0, len) };
      }
      case 'c_str':
        return { t: 'str', v: s };
      case 'find':
      case 'rfind': {
        const [needle, from] = args();
        const at = m.name === 'find' ? s.indexOf(text(needle!), from ? this.toNum(from) : 0) : s.lastIndexOf(text(needle!));
        return { t: 'int', v: at }; // -1 is string::npos
      }
      case 'back':
      case 'front': {
        if (!s.length) throw new RuntimeErr('EmptyContainer', `${m.name}() on an empty string`, `${m.name}() was called on an empty string.`);
        const base = self();
        return { b: base.b, strOf: base, i: m.name === 'back' ? s.length - 1 : 0 };
      }
      case 'push_back':
      case 'append': {
        this.write(self(), { t: 'str', v: s + args().map(text).join('') });
        return { t: 'void' };
      }
      case 'pop_back':
        if (!s.length) throw new RuntimeErr('EmptyContainer', 'pop_back() on an empty string', 'pop_back() was called on an empty string.');
        this.write(self(), { t: 'str', v: s.slice(0, -1) });
        return { t: 'void' };
      case 'clear':
        this.write(self(), { t: 'str', v: '' });
        return { t: 'void' };
      case 'insert': {
        const [pos, what] = args();
        const at = this.toNum(pos!);
        this.write(self(), { t: 'str', v: s.slice(0, at) + text(what!) + s.slice(at) });
        return { t: 'void' };
      }
      case 'erase': {
        const [pos, len] = args().map((v) => this.toNum(v));
        const at = pos ?? 0;
        this.write(self(), { t: 'str', v: s.slice(0, at) + (len === undefined ? '' : s.slice(at + len)) });
        return { t: 'void' };
      }
      case 'begin':
        return { t: 'siter', lv: self(), o: 0 };
      case 'end':
        return { t: 'siter', lv: self(), o: s.length };
      case 'compare': {
        const other = text(args()[0]!);
        return { t: 'int', v: s < other ? -1 : s > other ? 1 : 0 };
      }
    }
    throw new RuntimeErr('Unsupported', 'Unsupported method', `std::string.${m.name}() isn't supported yet.`);
  }

  private builtin(name: string, argExprs: Expr[]): RV | LV {
    const args = () => argExprs.map((a) => this.evalR(a));
    const num = (i: number) => this.toNum(this.evalR(argExprs[i]!));
    switch (name) {
      case 'printf': {
        const [fmt, ...rest] = args();
        this.stdout += this.format(fmt?.t === 'str' ? fmt.v : '', rest);
        return { t: 'int', v: 0 };
      }
      case 'puts': {
        const v = args()[0]!;
        this.stdout += (v.t === 'str' ? v.v : '') + '\n';
        return { t: 'int', v: 0 };
      }
      case 'putchar':
        this.stdout += String.fromCharCode(num(0));
        return { t: 'int', v: 0 };
      case 'scanf': {
        const fmt = this.evalR(argExprs[0]!);
        const specs = (fmt.t === 'str' ? fmt.v : '').match(/%[a-z]+/g) ?? [];
        let n = 0;
        specs.forEach((spec, i) => {
          const target = argExprs[i + 1];
          const tok = this.stdin[this.stdinPos];
          if (!target || tok === undefined) return;
          this.stdinPos++;
          const p = this.evalR(target);
          const v: RV = spec === '%s' ? { t: 'str', v: tok } : spec === '%c' ? { t: 'char', v: tok.charCodeAt(0) } : /f/.test(spec) ? { t: 'float', v: Number(tok) } : { t: 'int', v: parseInt(tok, 10) || 0 };
          if (p.t === 'ptr') this.write({ b: this.deref(p), i: p.o }, v);
          n++;
        });
        return { t: 'int', v: n };
      }
      case 'getline': {
        const target = argExprs[1];
        if (target) this.write(this.evalL(target), { t: 'str', v: this.stdin[this.stdinPos++] ?? '' });
        return { t: 'stream', name: 'cin' };
      }
      case 'malloc':
      case 'calloc': {
        const bytes = name === 'calloc' ? num(0) * num(1) : num(0);
        const b = this.alloc('array', 'heap', { ...INT_TYPE, base: 'byte' }, Array.from({ length: Math.max(1, bytes) }, () => (name === 'calloc' ? { t: 'int', v: 0 } : { t: 'uninit', ty: INT_TYPE })));
        return { t: 'ptr', b, o: 0, ty: { ...INT_TYPE, base: 'void' } };
      }
      case 'free': {
        const p = this.evalR(argExprs[0]!);
        this.free(p, 'free');
        return { t: 'void' };
      }
      case 'abs':
      case 'fabs': {
        const v = this.evalR(argExprs[0]!);
        return v.t === 'float' ? { t: 'float', v: Math.abs(v.v) } : { t: 'int', v: Math.abs(this.toNum(v)) };
      }
      case 'sqrt':
        return { t: 'float', v: Math.sqrt(num(0)) };
      case 'pow':
        return { t: 'float', v: Math.pow(num(0), num(1)) };
      case 'floor':
        return { t: 'float', v: Math.floor(num(0)) };
      case 'ceil':
        return { t: 'float', v: Math.ceil(num(0)) };
      case 'max':
      case 'min': {
        // max(a, b), max(a, b, cmp) and max({a, b, c})
        const values = argExprs.length === 1 && argExprs[0]!.type === 'InitList' ? argExprs[0]!.items.map((x) => this.evalR(x)) : args();
        const cmp = values.length === 3 && (values[2]!.t === 'fn' || values[2]!.t === 'cmp') ? values.pop() : undefined;
        return values.reduce((best, v) => (name === 'max' ? this.lessThan(best, v, cmp) : this.lessThan(v, best, cmp)) ? v : best);
      }
      case 'swap': {
        const a = this.evalL(argExprs[0]!);
        const b = this.evalL(argExprs[1]!);
        const va = this.read(a);
        const vb = this.read(b);
        if (va.t === 'agg' && vb.t === 'agg') {
          // Swapping containers or structs exchanges their contents.
          const x = va.b;
          const y = vb.b;
          [x.items, y.items] = [y.items, x.items];
          [x.fields, y.fields] = [y.fields, x.fields];
          [x.entries, y.entries] = [y.entries, x.entries];
          return { t: 'void' };
        }
        this.write(a, vb);
        this.write(b, va);
        return { t: 'void' };
      }
      case 'make_pair': {
        const [x, y] = args();
        return { t: 'agg', b: this.pairOf(x!, y!) };
      }
      case 'sort':
      case 'stable_sort':
      case 'reverse': {
        const [from, to, cmp] = args();
        if (from?.t === 'siter' && to?.t === 'siter') {
          const str = this.read(from.lv);
          if (str.t !== 'str') break;
          const chars = [...str.v.slice(from.o, to.o)];
          if (name === 'reverse') chars.reverse();
          else chars.sort((x, y) => (this.lessThan({ t: 'char', v: x.charCodeAt(0) }, { t: 'char', v: y.charCodeAt(0) }, cmp) ? -1 : 1));
          this.write(from.lv, { t: 'str', v: str.v.slice(0, from.o) + chars.join('') + str.v.slice(to.o) });
          return { t: 'void' };
        }
        const { b, lo, hi } = this.range(name, from, to);
        const slice = b.items.slice(lo, hi);
        if (name === 'reverse') slice.reverse();
        else {
          // Merge sort: stable, and asks the comparator only O(n log n) times.
          const sorted = this.mergeSort(slice, (x, y) => this.lessThan(x, y, cmp));
          slice.splice(0, slice.length, ...sorted);
        }
        b.items.splice(lo, slice.length, ...slice);
        return { t: 'void' };
      }
      case 'max_element':
      case 'min_element': {
        const [from, to, cmp] = args();
        const { b, lo, hi } = this.range(name, from, to);
        let best = lo;
        for (let i = lo + 1; i < hi; i++) {
          const better = name === 'max_element' ? this.lessThan(b.items[best]!, b.items[i]!, cmp) : this.lessThan(b.items[i]!, b.items[best]!, cmp);
          if (better) best = i;
        }
        return { t: 'ptr', b, o: hi > lo ? best : hi, ty: b.elemType };
      }
      case 'accumulate': {
        const [from, to, init] = args();
        const { b, lo, hi } = this.range(name, from, to);
        let sum = init ?? { t: 'int', v: 0 };
        for (let i = lo; i < hi; i++) sum = this.arith('+', sum, b.items[i]!);
        return sum;
      }
      case 'count':
      case 'find': {
        const [from, to, value] = args();
        const { b, lo, hi } = this.range(name, from, to);
        const key = this.keyOf(this.coerce(value!, b.elemType));
        if (name === 'count') return { t: 'int', v: b.items.slice(lo, hi).filter((x) => this.keyOf(x) === key).length };
        const at = b.items.slice(lo, hi).findIndex((x) => this.keyOf(x) === key);
        return { t: 'ptr', b, o: at < 0 ? hi : lo + at, ty: b.elemType };
      }
      case 'lower_bound':
      case 'upper_bound':
      case 'binary_search': {
        const [from, to, value] = args();
        const { b, lo, hi } = this.range(name, from, to);
        let l = lo;
        let r = hi;
        while (l < r) {
          const mid = (l + r) >> 1;
          const c = this.compareRV(b.items[mid]!, value!);
          if (name === 'upper_bound' ? c <= 0 : c < 0) l = mid + 1;
          else r = mid;
        }
        if (name === 'binary_search') return { t: 'bool', v: l < hi && this.compareRV(b.items[l]!, value!) === 0 };
        return { t: 'ptr', b, o: l, ty: b.elemType };
      }
      case 'fill':
      case 'iota': {
        const [from, to, value] = args();
        const { b, lo, hi } = this.range(name, from, to);
        for (let i = lo; i < hi; i++) b.items[i] = this.stored(name === 'fill' ? value! : this.arith('+', value!, { t: 'int', v: i - lo }), b.elemType);
        return { t: 'void' };
      }
      case 'memset': {
        // memset(dp, -1, sizeof dp): fills every element (rows too) with the byte value.
        const [target, value] = args();
        const block = target?.t === 'agg' ? target.b : target?.t === 'ptr' ? this.deref(target) : null;
        if (!block) throw new RuntimeErr('TypeError', 'Invalid memset', 'memset() needs an array or pointer.');
        const fillAll = (b: Block) => b.items.forEach((x, i) => (x.t === 'agg' ? fillAll(x.b) : (b.items[i] = this.coerce(value!, b.elemType))));
        fillAll(block);
        return { t: 'void' };
      }
      case 'gcd':
      case '__gcd':
      case 'lcm': {
        let [x, y] = args().map((v) => Math.abs(this.toNum(v)));
        const product = x! * y!;
        while (y) [x, y] = [y, x! % y];
        return { t: 'int', v: name === 'lcm' ? (x ? product / x : 0) : x! };
      }
      case 'stoi':
      case 'stol':
      case 'stoll':
      case 'atoi': {
        const v = this.evalR(argExprs[0]!);
        const n = parseInt(v.t === 'str' ? v.v : '', 10);
        if (Number.isNaN(n)) throw new RuntimeErr('InvalidArgument', 'Invalid number', `${name}() got text that isn't a number.`);
        return name === 'stoi' || name === 'atoi' ? { t: 'int', v: n | 0 } : { t: 'long', v: BigInt(n) };
      }
      case 'isdigit':
      case 'isalpha':
      case 'isalnum':
      case 'isspace':
      case 'islower':
      case 'isupper': {
        const c = String.fromCharCode(num(0));
        const tests: Record<string, RegExp> = { isdigit: /\d/, isalpha: /[A-Za-z]/, isalnum: /[A-Za-z0-9]/, isspace: /\s/, islower: /[a-z]/, isupper: /[A-Z]/ };
        return { t: 'bool', v: tests[name]!.test(c) };
      }
      case 'tolower':
      case 'toupper': {
        const c = String.fromCharCode(num(0));
        return { t: 'char', v: (name === 'tolower' ? c.toLowerCase() : c.toUpperCase()).charCodeAt(0) };
      }
      case 'strlen': {
        const v = this.evalR(argExprs[0]!);
        if (v.t === 'str') return { t: 'int', v: v.v.length };
        if (v.t === 'agg' || v.t === 'ptr') {
          const b = v.t === 'agg' ? v.b : this.deref(v);
          let n = v.t === 'ptr' ? v.o : 0;
          const start = n;
          while (n < b.items.length && this.toNum(b.items[n]!) !== 0) n++;
          return { t: 'int', v: n - start };
        }
        return { t: 'int', v: 0 };
      }
      case 'to_string': {
        const v = this.evalR(argExprs[0]!);
        return { t: 'str', v: v.t === 'float' ? v.v.toFixed(6) : String(this.toNum(v)) };
      }
      case 'rand':
        this.rngState = (this.rngState * 1103515245 + 12345) & 0x7fffffff;
        return { t: 'int', v: this.rngState };
      case 'srand':
        this.rngState = num(0) || 1;
        return { t: 'void' };
      case 'time':
        return { t: 'int', v: 0 };
      case 'setprecision':
        return { t: 'manip', name: 'setprecision', arg: num(0) };
      case 'exit':
        throw new ReturnSignal({ t: 'int', v: num(0) });
    }
    throw new RuntimeErr('NameError', 'Unknown function', `'${name}' is not a function Tracel knows about.`, `There is no function named '${name}' in this program, and it isn't one of the library functions Tracel supports.`);
  }

  /** A [first, last) range of one container or array, from two pointers/iterators. */
  private range(fn: string, from?: RV, to?: RV): { b: Block; lo: number; hi: number } {
    if (from?.t !== 'ptr' || to?.t !== 'ptr' || !from.b || from.b !== to.b) {
      throw new RuntimeErr('TypeError', `Invalid ${fn}() range`, `${fn}() needs a range like (v.begin(), v.end()) or (arr, arr + n).`);
    }
    if (from.o < 0 || to.o > from.b.items.length || from.o > to.o) this.checkBounds(from.b.items.length + 1, from.o < 0 ? from.o : to.o);
    return { b: from.b, lo: from.o, hi: to.o };
  }

  private mergeSort(items: RV[], less: (a: RV, b: RV) => boolean): RV[] {
    if (items.length < 2) return items;
    const mid = items.length >> 1;
    const left = this.mergeSort(items.slice(0, mid), less);
    const right = this.mergeSort(items.slice(mid), less);
    const out: RV[] = [];
    while (left.length && right.length) out.push(less(right[0]!, left[0]!) ? right.shift()! : left.shift()!);
    return [...out, ...left, ...right];
  }

  private free(p: RV, how: 'free' | 'delete') {
    if (p.t !== 'ptr') throw new RuntimeErr('TypeError', 'Invalid free', `${how} needs a pointer.`);
    if (!p.b) return; // freeing null is allowed
    if (p.b.freed) throw new RuntimeErr('DoubleFree', 'Double free', `This memory was already released with ${how}.`, `The program released the same memory twice. After ${how}, the pointer should not be used again.`);
    if (p.b.region !== 'heap') throw new RuntimeErr('InvalidFree', 'Invalid free', `${how} was called on memory that was not allocated with ${how === 'free' ? 'malloc' : 'new'}.`, `Only memory from ${how === 'free' ? 'malloc' : 'new'} can be released. Local variables are cleaned up automatically.`);
    p.b.freed = true;
  }

  // ---- output ----

  private format(fmt: string, args: RV[]): string {
    let ai = 0;
    return fmt.replace(/%([-+ 0#]*)(\d+|\*)?(?:\.(\d+))?(hh|h|ll|l|z)?([diufFeEgGxXcspo%])/g, (_m, flags: string, width: string | undefined, prec: string | undefined, _len, spec: string) => {
      if (spec === '%') return '%';
      const v = args[ai++];
      if (!v) return '';
      let s: string;
      switch (spec) {
        case 'd':
        case 'i':
          s = v.t === 'long' ? String(v.v) : String(Math.trunc(this.toNum(v)));
          break;
        case 'u':
          s = v.t === 'long' ? String(BigInt.asUintN(64, v.v)) : String(Math.trunc(this.toNum(v)) >>> 0);
          break;
        case 'f':
        case 'F':
          s = this.toNum(v).toFixed(prec !== undefined ? Number(prec) : 6);
          break;
        case 'e':
        case 'E':
          s = this.toNum(v).toExponential(prec !== undefined ? Number(prec) : 6);
          break;
        case 'g':
        case 'G':
          s = String(Number(this.toNum(v).toPrecision(prec !== undefined ? Number(prec) || 1 : 6)));
          break;
        case 'x':
        case 'X':
          s = v.t === 'long' ? BigInt.asUintN(64, v.v).toString(16) : (this.toNum(v) >>> 0).toString(16);
          if (spec === 'X') s = s.toUpperCase();
          break;
        case 'o':
          s = (this.toNum(v) >>> 0).toString(8);
          break;
        case 'c':
          s = String.fromCharCode(this.toNum(v));
          break;
        case 's':
          s = this.cString(v);
          break;
        case 'p':
          s = v.t === 'ptr' && v.b ? this.hex(v.b.addr + v.o * sizeOf(v.ty, this.program.structs)) : '(nil)';
          break;
        default:
          s = '';
      }
      const w = width && width !== '*' ? Number(width) : 0;
      if (s.length < w) s = flags.includes('-') ? s.padEnd(w) : s.padStart(w, flags.includes('0') && spec !== 's' ? '0' : ' ');
      return s;
    });
  }

  private cString(v: RV): string {
    if (v.t === 'str') return v.v;
    const b = v.t === 'agg' ? v.b : v.t === 'ptr' ? this.deref(v) : null;
    if (!b) return '';
    let s = '';
    for (let i = v.t === 'ptr' ? v.o : 0; i < b.items.length; i++) {
      const c = b.items[i]!;
      if (c.t === 'uninit' || this.toNum(c) === 0) break;
      s += String.fromCharCode(this.toNum(c));
    }
    return s;
  }

  private streamOp(stream: RV & { t: 'stream' }, op: string, right: Expr): RV {
    if (stream.name === 'cin') {
      if (op !== '>>') throw new RuntimeErr('TypeError', 'Invalid input', 'Use >> to read from cin.');
      const lv = this.evalL(right);
      const tok = this.stdin[this.stdinPos++];
      if (tok === undefined) return stream;
      const cur = 'whole' in lv ? null : this.read(lv);
      const ty = cur?.t === 'uninit' ? cur.ty : 'f' in lv ? this.fieldType(lv.b, lv.f) : 'key' in lv ? (lv.b.valType ?? INT_TYPE) : 'strOf' in lv ? { ...INT_TYPE, base: 'char' } : lv.b.elemType;
      const v: RV = ty.base === 'string' ? { t: 'str', v: tok } : ty.base === 'char' ? { t: 'char', v: tok.charCodeAt(0) } : isFloatBase(ty.base) ? { t: 'float', v: Number(tok) } : { t: 'int', v: parseInt(tok, 10) || 0 };
      this.write(lv, v);
      return stream;
    }
    if (op !== '<<') throw new RuntimeErr('TypeError', 'Invalid output', 'Use << to write to cout.');
    const v = this.evalR(right);
    if (v.t === 'manip') {
      if (v.name === 'endl') this.stdout += '\n';
      else if (v.name === 'fixed') this.coutFixed = true;
      else if (v.name === 'setprecision') this.coutPrecision = v.arg ?? 6;
      return stream;
    }
    if (stream.name === 'cout') this.stdout += this.coutText(v);
    return stream;
  }

  private coutText(v: RV): string {
    switch (v.t) {
      case 'str':
        return v.v;
      case 'char':
        return String.fromCharCode(v.v);
      case 'bool':
        return v.v ? '1' : '0';
      case 'int':
      case 'long':
        return String(v.v);
      case 'float':
        return this.coutFixed ? v.v.toFixed(this.coutPrecision) : String(Number(v.v.toPrecision(this.coutPrecision || 1)));
      case 'ptr':
        return v.b ? this.hex(v.b.addr + v.o * sizeOf(v.ty, this.program.structs)) : '0';
      case 'agg':
        if (v.b.kind === 'array' && v.b.elemType.base === 'char') return this.cString(v);
        return this.hex(v.b.addr);
      case 'uninit':
        throw this.uninitError();
    }
    return '';
  }

  // ---- statements ----

  private execBlockBody(body: Stmt[], frame: CallFrame) {
    for (const s of body) this.exec(s, frame);
  }

  private withScope(frame: CallFrame, fn: () => void) {
    const scope: Scope = { vars: new Map(), owned: [] };
    frame.scopes.push(scope);
    try {
      fn();
    } finally {
      frame.scopes.pop();
      this.releaseScope(scope);
    }
  }

  private exec(s: Stmt, frame: CallFrame): void {
    switch (s.type) {
      case 'Block':
        this.withScope(frame, () => this.execBlockBody(s.body, frame));
        return;
      case 'Empty':
        return;
      case 'Decl':
        this.step(s.line, s.range);
        this.execDecl(s, frame.scopes[frame.scopes.length - 1]!, 'stack');
        return;
      case 'ExprStmt':
        this.step(s.line, s.range);
        this.evalR(s.expr);
        return;
      case 'Return':
        this.step(s.line, s.range);
        // return {a, b}; builds the function's return type.
        throw new ReturnSignal(s.value ? this.evalAs(s.value, frame.returnType ?? INT_TYPE) : { t: 'void' });
      case 'Break':
        this.step(s.line, s.range);
        throw new BreakSignal();
      case 'Continue':
        this.step(s.line, s.range);
        throw new ContinueSignal();
      case 'Delete': {
        this.step(s.line, s.range);
        const p = this.evalR(s.arg);
        // delete runs the destructor first, while the object is still alive.
        if (p.t === 'ptr' && p.b && !p.b.freed && p.b.kind === 'struct') {
          const dtor = this.findMethod(p.b.struct!, '~', 0);
          if (dtor) this.callFunction(dtor, [], s.line, p.b);
        }
        this.free(p, 'delete');
        return;
      }
      case 'If': {
        this.step(s.line);
        const taken = this.truthy(this.evalR(s.test));
        this.pendingEvents.push({ type: 'branch', line: s.line, construct: 'if', taken });
        if (taken) this.exec(s.then, frame);
        else if (s.else) this.exec(s.else, frame);
        return;
      }
      case 'While':
        this.step(s.line);
        this.loop(s, frame, () => this.truthy(this.evalR(s.test)), s.body);
        return;
      case 'DoWhile': {
        this.loopCounts.set(s, 0);
        for (;;) {
          this.iterate(s);
          if (this.runBody(s.body, frame) === 'break') break;
          this.step(s.testLine);
          if (!this.truthy(this.evalR(s.test))) break;
        }
        return;
      }
      case 'For':
        this.step(s.line);
        this.withScope(frame, () => {
          if (s.init) {
            if (s.init.type === 'Decl') this.execDecl(s.init, frame.scopes[frame.scopes.length - 1]!, 'stack');
            else this.exec(s.init, frame);
          }
          this.loop(s, frame, () => (s.test ? this.truthy(this.evalR(s.test)) : true), s.body, () => s.update && this.evalR(s.update));
        });
        return;
      case 'RangeFor': {
        this.step(s.line);
        // for (int v : {3, 1, 4}) iterates a temporary list.
        const it: RV =
          s.iterable.type === 'InitList'
            ? (() => {
                const values = s.iterable.items.map((x) => this.evalR(x));
                const elem = s.decl.type.base === 'auto' && values[0] ? this.typeOfValue(values[0]) : { ...s.decl.type, ref: false };
                const tmp = this.alloc('array', 'stack', elem, values.map((v) => this.coerce(v, elem)));
                this.blocks.delete(tmp.id);
                return { t: 'agg', b: tmp } as RV;
              })()
            : this.evalR(s.iterable);
        // What one iteration binds: a container slot, a map entry, or a string character.
        let count: number;
        let element: (i: number) => { lv: LV } | { value: RV };
        if (it.t === 'str') {
          const base = this.isLValue(s.iterable) ? this.evalL(s.iterable) : null;
          count = it.v.length;
          element = (i) => (base && s.decl.type.ref ? { lv: { b: base.b, strOf: base, i } } : { value: { t: 'char', v: it.v.charCodeAt(i) } });
        } else if (it.t === 'agg' && it.b.kind === 'map') {
          const m = it.b;
          count = m.entries.length;
          element = (i) => {
            const pair = (this.makeDefault({ ...INT_TYPE, base: 'pair', args: [m.elemType, m.valType ?? INT_TYPE] }, 'stack', null) as RV & { t: 'agg' }).b;
            this.blocks.delete(pair.id);
            pair.fields.set('first', m.entries[i]!.k);
            pair.fields.set('second', m.entries[i]!.v);
            return { value: { t: 'agg', b: pair } };
          };
        } else if (it.t === 'agg' && it.b.kind !== 'struct') {
          const b = it.b;
          count = b.items.length;
          element = (i) => ({ lv: { b, i } });
        } else {
          throw new RuntimeErr('TypeError', 'Not iterable', 'A range-based for loop needs an array, string or container.');
        }
        const mapBlock = it.t === 'agg' && it.b.kind === 'map' ? it.b : null;
        let i = 0;
        this.loopCounts.set(s, 0);
        this.withScope(frame, () => {
          for (;;) {
            if (i > 0) this.step(s.line);
            if (i >= count) break;
            // A fresh scope per iteration, so the loop variable is recreated each time.
            const scope: Scope = { vars: new Map(), owned: [] };
            frame.scopes.push(scope);
            try {
              const el = element(i);
              if (s.decl.bindings) {
                if (mapBlock && s.decl.type.ref) {
                  // for (auto& [k, v] : m): v aliases the stored value.
                  const entry = mapBlock.entries[i]!;
                  this.bindNames([s.decl.bindings[0]!], { t: 'agg', b: this.pairOf(entry.k, entry.k) }, scope, false);
                  if (s.decl.bindings[1]) scope.vars.set(s.decl.bindings[1], { b: mapBlock, key: this.keyOf(entry.k) });
                } else {
                  this.bindNames(s.decl.bindings, 'lv' in el ? this.read(el.lv) : el.value, scope, s.decl.type.ref && 'lv' in el);
                }
              } else if (s.decl.type.ref && 'lv' in el) {
                scope.vars.set(s.decl.name, el.lv);
              } else {
                const value = 'lv' in el ? this.read(el.lv) : el.value;
                if (value.t === 'agg') scope.vars.set(s.decl.name, { b: this.copyAgg(value.b, 'stack', scope.owned), whole: true });
                else {
                  const ty = s.decl.type.base === 'auto' ? this.typeOfValue(value) : s.decl.type;
                  const cell = this.alloc('scalar', 'stack', ty, [this.coerce(value, ty)], undefined, s.decl.name);
                  scope.owned.push(cell);
                  scope.vars.set(s.decl.name, { b: cell, i: 0 });
                }
              }
              this.iterate(s);
              i++;
              if (this.runBody(s.body, frame) === 'break') break;
            } finally {
              frame.scopes.pop();
              this.releaseScope(scope);
            }
          }
        });
        return;
      }
      case 'Switch': {
        this.step(s.line);
        const v = this.toNum(this.evalR(s.test));
        let start = s.cases.findIndex((c) => c.test && this.toNum(this.evalR(c.test)) === v);
        if (start < 0) start = s.cases.findIndex((c) => !c.test);
        if (start < 0) return;
        try {
          this.withScope(frame, () => {
            for (let c = start; c < s.cases.length; c++) this.execBlockBody(s.cases[c]!.body, frame);
          });
        } catch (sig) {
          if (!(sig instanceof BreakSignal)) throw sig;
        }
        return;
      }
    }
  }

  private iterate(s: Stmt) {
    const n = (this.loopCounts.get(s) ?? 0) + 1;
    this.loopCounts.set(s, n);
    this.pendingEvents.push({ type: 'loop_iter', line: s.line, iteration: n });
  }

  /** Runs a loop body, translating break/continue. */
  private runBody(body: Stmt, frame: CallFrame): 'break' | 'next' {
    try {
      this.exec(body, frame);
    } catch (sig) {
      if (sig instanceof BreakSignal) return 'break';
      if (!(sig instanceof ContinueSignal)) throw sig;
    }
    return 'next';
  }

  private loop(s: Stmt, frame: CallFrame, test: () => boolean, body: Stmt, update?: () => unknown) {
    this.loopCounts.set(s, 0);
    let first = true;
    for (;;) {
      if (!first) {
        // Back at the loop header: the update (i++) and the re-check belong to this line.
        this.step(s.line);
        update?.();
      }
      first = false;
      if (!test()) break;
      this.iterate(s);
      if (this.runBody(body, frame) === 'break') break;
    }
  }

  private execDecl(s: Stmt & { type: 'Decl' }, scope: Scope, region: 'stack' | 'static') {
    for (const d of s.decls) this.declare(d, scope, region);
  }

  private declare(d: Declarator, scope: Scope, region: 'stack' | 'static') {
    const zero = region === 'static';
    const ty = d.type;

    // Structured binding: auto [a, b] = p;
    if (d.bindings) {
      this.bindNames(d.bindings, this.evalR(d.init!), scope, ty.ref);
      return;
    }

    // Reference: alias the existing storage.
    if (ty.ref) {
      if (!d.init || !this.isLValue(d.init)) throw new RuntimeErr('TypeError', 'Invalid reference', `Reference '${d.name}' must be bound to a variable.`);
      const lv = this.evalL(d.init);
      scope.vars.set(d.name, { ...lv, name: undefined });
      return;
    }

    // Array.
    if (d.arraySize !== undefined) {
      const list = d.init?.type === 'InitList' ? d.init.items : null;
      const strInit = d.init?.type === 'Str' ? d.init.value : null;
      const inner = (d.innerDims ?? []).map((dim) => this.toNum(this.evalR(dim)));
      const flatRows = list && inner.length && list.every((it) => it.type !== 'InitList') ? Math.ceil(list.length / inner[0]!) : undefined;
      const n = d.arraySize ? this.toNum(this.evalR(d.arraySize)) : (flatRows ?? (list ? list.length : strInit !== null ? strInit.length + 1 : 0));
      if (n < 0) throw new RuntimeErr('BadAlloc', 'Invalid array size', `Array '${d.name}' cannot have size ${n}.`);
      const b = this.makeArray(ty, [n, ...inner], region, scope.owned, zero);
      if (list) this.fillFromList(b, list);
      else if (strInit !== null) [...strInit, '\0'].forEach((c, i) => i < n && (b.items[i] = { t: 'char', v: c.charCodeAt(0) }));
      scope.vars.set(d.name, { b, whole: true });
      return;
    }

    // Aggregates: structs and containers live in their own block.
    let init: RV | undefined;
    if (d.init && d.init.type !== 'InitList') init = this.evalR(d.init);
    const resolved: TypeInfo = ty.base === 'auto' && init ? this.typeOfValue(init) : ty;

    if (!resolved.ptr && (CONTAINERS.has(resolved.base) || this.structOf(resolved))) {
      let b: Block;
      if (init?.t === 'agg') b = this.copyAgg(init.b, region, scope.owned);
      else if (this.program.structs.get(resolved.base)?.methods.get(resolved.base)?.length) {
        // A class with constructors: Point p; Point p(1, 2); Point p{1, 2};
        const args = d.ctorArgs ?? (d.init?.type === 'InitList' ? d.init.items : []);
        b = this.construct(this.program.structs.get(resolved.base)!, args, region, scope.owned, d.line);
      } else {
        b = (this.makeDefault(resolved, region, scope.owned, zero) as RV & { t: 'agg' }).b;
        if (d.init?.type === 'InitList') this.fillFromList(b, d.init.items);
        else if (d.ctorArgs?.length) {
          if (b.kind === 'struct') this.fillFromList(b, d.ctorArgs); // pair<int, int> p(1, 2)
          else this.applyCtorArgs(b, d.ctorArgs);
        }
      }
      scope.vars.set(d.name, { b, whole: true });
      return;
    }

    // Scalars and pointers.
    let value: RV;
    if (d.init?.type === 'InitList') value = d.init.items[0] ? this.evalR(d.init.items[0]) : this.makeDefault(resolved, region, null, true);
    else if (d.ctorArgs?.length) value = resolved.base === 'string' ? this.constructTemp(resolved, d.ctorArgs, false) : this.evalR(d.ctorArgs[0]!);
    else value = init ?? this.makeDefault(resolved, region, null, zero);
    if (value.t === 'agg' && value.b.kind === 'array') value = { t: 'ptr', b: value.b, o: 0, ty: value.b.elemType };
    if (value.t === 'ptr' && resolved.ptr && value.b?.elemType.base === 'byte') this.retype(value.b, this.pointee(resolved));
    const b = this.alloc('scalar', region, resolved, [this.coerce(value, resolved)], undefined, d.name);
    scope.owned.push(b);
    const old = scope.vars.get(d.name);
    if (old && old.b.kind === 'scalar') {
      old.b.dead = true;
      this.blocks.delete(old.b.id);
    }
    scope.vars.set(d.name, { b, i: 0 });
  }

  private typeOfValue(v: RV): TypeInfo {
    switch (v.t) {
      case 'long':
        return { ...INT_TYPE, base: 'long long' };
      case 'float':
        return { ...INT_TYPE, base: 'double' };
      case 'bool':
        return { ...INT_TYPE, base: 'bool' };
      case 'char':
        return { ...INT_TYPE, base: 'char' };
      case 'str':
        return { ...INT_TYPE, base: 'string' };
      case 'ptr':
        return { ...v.ty, ptr: v.ty.ptr + 1 };
      case 'agg':
        if (v.b.kind === 'struct') return v.b.struct!.name.startsWith('pair<') ? { ...INT_TYPE, base: 'pair', args: v.b.struct!.fields.map((f) => f.type) } : { ...INT_TYPE, base: v.b.struct!.name };
        if (v.b.kind === 'map') return { ...INT_TYPE, base: v.b.ordered ? 'map' : 'unordered_map', args: [v.b.elemType, v.b.valType ?? INT_TYPE] };
        return {
          ...INT_TYPE,
          base: ({ cpp_stack: 'stack', cpp_queue: 'queue', deque: 'deque', set: v.b.ordered ? 'set' : 'unordered_set', pq: 'priority_queue' } as Record<string, string>)[v.b.kind] ?? 'vector',
          args: [v.b.elemType],
        };
      default:
        return INT_TYPE;
    }
  }
}

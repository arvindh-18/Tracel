import { RawStep, RawTrace } from '../../../trace/normalize';
import { Frame, HeapObject, TraceError, TraceEvent, Value } from '../../../trace/schema';
import { CompileError } from './lexer';
import { CONTAINERS, Declarator, Expr, FunctionDef, Program, Stmt, StructDef, TypeInfo, parseProgram, typeName } from './parser';

export interface ExecOptions {
  stepLimit?: number;
  stdin?: string;
}

// ---- Runtime model ----
//
// Every variable lives in a Block. A scalar variable is a one-slot block, an
// array is an n-slot block, a struct keeps named fields, and the STL
// containers keep their items. Pointers are (block, offset) pairs, so &x,
// array decay, pointer arithmetic and new/delete all share one model.

type BlockKind = 'scalar' | 'array' | 'struct' | 'vector' | 'cpp_stack' | 'cpp_queue';

interface Block {
  id: string;
  kind: BlockKind;
  region: 'stack' | 'heap' | 'static';
  elemType: TypeInfo; // slot type (scalar/array/containers)
  struct?: StructDef;
  items: RV[];
  fields: Map<string, RV>;
  freed: boolean;
  dead: boolean; // stack storage whose scope has ended
  addr: number;
}

type RV =
  | { t: 'int'; v: number }
  | { t: 'float'; v: number }
  | { t: 'bool'; v: boolean }
  | { t: 'char'; v: number }
  | { t: 'str'; v: string }
  | { t: 'ptr'; b: Block | null; o: number; ty: TypeInfo }
  | { t: 'agg'; b: Block }
  | { t: 'uninit'; ty: TypeInfo }
  | { t: 'void' }
  | { t: 'stream'; name: 'cout' | 'cin' | 'cerr' }
  | { t: 'manip'; name: string; arg?: number };

type LV = { b: Block; i: number; name?: string } | { b: Block; f: string; name?: string } | { b: Block; whole: true; name?: string };

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
}

class RuntimeErr extends Error {
  constructor(
    public kind: string,
    public title: string,
    message: string,
    public explanation: string = message
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

  constructor(
    private program: Program,
    private source: string,
    private language: 'c' | 'cpp',
    options: ExecOptions
  ) {
    this.stepLimit = options.stepLimit ?? 5000;
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
    });

    try {
      for (const g of this.program.globals) this.execDecl(g as Stmt & { type: 'Decl' }, this.globals, 'static');
      const main = this.program.functions.get('main');
      if (!main) {
        throw new RuntimeErr('NoMain', 'No main function', 'This program has no main() function, so there is nothing to run.', 'C and C++ programs start running at main(). Add an int main() { ... } function.');
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
          context: [],
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

  private step(line: number) {
    if (this.stack.length) this.stack[this.stack.length - 1]!.line = line;
    this.record(line, 'line');
  }

  private record(line: number, kind: RawStep['kind'], error?: TraceError) {
    if (this.steps.length >= this.stepLimit) throw new LimitSignal();
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
    if ('f' in lv) return this.toValue(lv.b.fields.get(lv.f)!, this.fieldType(lv.b, lv.f));
    return this.toValue(lv.b.items[lv.i] ?? { t: 'uninit', ty: lv.b.elemType }, lv.b.elemType);
  }

  private toValue(rv: RV, ty: TypeInfo): Value {
    switch (rv.t) {
      case 'int':
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
      default:
        return {
          ...base,
          kind: 'array',
          typeName: b.kind === 'scalar' ? elem : `${elem}[${b.items.length}]`,
          items: b.items.map((v) => this.toValue(v, b.elemType)),
        };
    }
  }

  private hex(n: number): string {
    return '0x' + n.toString(16).padStart(8, '0');
  }

  // ---- storage ----

  private alloc(kind: BlockKind, region: Block['region'], elemType: TypeInfo, items: RV[] = [], struct?: StructDef): Block {
    const id = `h${++this.blockCounter}`;
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
    const b: Block = { id, kind, region, elemType, struct, items, fields: new Map(), freed: false, dead: false, addr };
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
      const kind: BlockKind = type.base === 'stack' ? 'cpp_stack' : type.base === 'queue' ? 'cpp_queue' : 'vector';
      const b = this.alloc(kind, 'heap', type.args[0] ?? INT_TYPE);
      owner?.push(b);
      return { t: 'agg', b };
    }
    const def = this.program.structs.get(type.base);
    if (def) {
      const b = this.alloc('struct', region, type, [], def);
      owner?.push(b);
      for (const f of def.fields) {
        let v: RV;
        if (f.init) v = this.coerce(this.evalR(f.init), f.type);
        else if (f.arraySize !== undefined) {
          const n = f.arraySize ? this.toNum(this.evalR(f.arraySize)) : 0;
          const arr = this.alloc('array', region, f.type, Array.from({ length: n }, () => this.makeDefault(f.type, region, owner, zero)));
          owner?.push(arr);
          v = { t: 'agg', b: arr };
        } else v = this.makeDefault(f.type, region, owner, zero);
        b.fields.set(f.name, v);
      }
      return { t: 'agg', b };
    }
    if (zero) return this.coerce({ t: 'int', v: 0 }, type);
    return { t: 'uninit', ty: type };
  }

  private pointee(t: TypeInfo): TypeInfo {
    return { ...t, ptr: Math.max(0, t.ptr - 1), ref: false };
  }

  /** Deep copy for value semantics (struct assignment, passing a vector by value). */
  private copyAgg(src: Block, region: Block['region'], owner: Block[] | null): Block {
    const items = src.items.map((v) => (v.t === 'agg' ? ({ t: 'agg', b: this.copyAgg(v.b, region, owner) } as RV) : v));
    const b = this.alloc(src.kind, src.kind === 'array' || src.kind === 'struct' ? region : 'heap', src.elemType, items, src.struct);
    for (const [f, v] of src.fields) b.fields.set(f, v.t === 'agg' ? { t: 'agg', b: this.copyAgg(v.b, region, owner) } : v);
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
    if ('whole' in lv) return { t: 'agg', b: lv.b };
    if ('f' in lv) {
      if (!lv.b.fields.has(lv.f)) throw new RuntimeErr('UnknownField', 'Unknown field', `'${lv.b.struct?.name}' has no field named '${lv.f}'.`);
      return lv.b.fields.get(lv.f)!;
    }
    this.checkBounds(lv.b.items.length, lv.i, lv.name);
    return lv.b.items[lv.i]!;
  }

  private write(lv: LV, value: RV) {
    this.checkAlive(lv.b, lv.name);
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
    this.checkBounds(lv.b.items.length, lv.i, lv.name);
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

  private checkBounds(n: number, i: number, name?: string) {
    if (i >= 0 && i < n) return;
    const label = name ? `'${name}'` : 'This array';
    throw new RuntimeErr(
      'OutOfBounds',
      'Index out of bounds',
      `OutOfBounds: index ${i} is out of bounds for ${label} of size ${n}.`,
      n === 0
        ? `${label} is empty, so there is no element at index ${i}.`
        : `${label} has ${n} element${n === 1 ? '' : 's'} (indices 0 to ${n - 1}), but the program used index ${i}.`
    );
  }

  private lookup(name: string): LV | undefined {
    const frame = this.stack[this.stack.length - 1];
    if (frame) {
      for (let s = frame.scopes.length - 1; s >= 0; s--) {
        const lv = frame.scopes[s]!.vars.get(name);
        if (lv) return lv;
      }
    }
    return this.globals.vars.get(name);
  }

  private evalL(e: Expr): LV {
    switch (e.type) {
      case 'Ident': {
        const lv = this.lookup(e.name);
        if (!lv) throw new RuntimeErr('NameError', 'Unknown name', `'${e.name}' was not declared.`, `'${e.name}' is used here, but no variable with that name exists at this point.`);
        return { ...lv, name: e.name };
      }
      case 'Index': {
        const obj = this.evalR(e.object);
        const i = this.toNum(this.evalR(e.index));
        const name = this.exprName(e.object);
        if (obj.t === 'agg') return { b: obj.b, i, name };
        if (obj.t === 'ptr') return { b: this.deref(obj, name), i: obj.o + i, name };
        if (obj.t === 'str') throw new RuntimeErr('Unsupported', 'Unsupported feature', "Changing a single character of a std::string isn't supported yet.");
        throw new RuntimeErr('TypeError', 'Not indexable', `${name ?? 'This value'} can't be indexed with [].`);
      }
      case 'Member': {
        const name = this.exprName(e.object);
        let b: Block;
        if (e.arrow) {
          const p = this.evalR(e.object);
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

  private deref(p: RV & { t: 'ptr' }, name?: string): Block {
    if (!p.b) {
      throw new RuntimeErr('NullDereference', 'Null pointer dereference', `${name ? `'${name}'` : 'This pointer'} is null, so there is nothing to read or write through it.`, 'The program followed a pointer that points to nothing (nullptr/NULL).');
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
      `${name ? `'${name}'` : 'This variable'} was declared without a value, so reading it gives garbage. Give it a value first.`
    );
  }

  private truthy(v: RV): boolean {
    if (v.t === 'ptr') return v.b !== null;
    if (v.t === 'str' || v.t === 'agg' || v.t === 'stream') return true;
    return this.toNum(v) !== 0;
  }

  private coerce(v: RV, ty: TypeInfo): RV {
    if (v.t === 'uninit' || v.t === 'agg' || v.t === 'void' || v.t === 'stream' || v.t === 'manip') return v;
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
    const n = this.toNum(v);
    if (b === 'bool') return { t: 'bool', v: n !== 0 };
    if (b === 'char') return { t: 'char', v: ((Math.trunc(n) % 256) + 256) % 256 };
    if (isFloatBase(b)) return { t: 'float', v: b === 'float' ? Math.fround(n) : n };
    if (isIntBase(b)) {
      const t = Math.trunc(n);
      if (b === 'int' || b === 'short') return { t: 'int', v: ty.unsigned ? t >>> 0 : t | 0 };
      return { t: 'int', v: t };
    }
    return v;
  }

  private evalR(e: Expr): RV {
    switch (e.type) {
      case 'Num':
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
        const next = old.t === 'ptr' ? { ...old, o: old.o + delta } : this.arith('+', old, { t: 'int', v: delta });
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
    }
  }

  private evalUnary(e: Expr & { type: 'Unary' }): RV {
    switch (e.op) {
      case '&': {
        const lv = this.evalL(e.arg);
        if ('whole' in lv) return { t: 'ptr', b: lv.b, o: 0, ty: lv.b.kind === 'struct' ? { ...INT_TYPE, base: lv.b.struct!.name } : lv.b.elemType };
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
        return v.t === 'float' ? { t: 'float', v: -v.v } : { t: 'int', v: -this.toNum(v) | 0 };
      }
      case '+':
        return this.evalR(e.arg);
      case '~':
        return { t: 'int', v: ~this.toNum(this.evalR(e.arg)) };
      case 'sizeof': {
        const v = this.evalR(e.arg);
        if (v.t === 'agg' && v.b.kind === 'array') return { t: 'int', v: v.b.items.length * sizeOf(v.b.elemType, this.program.structs) };
        if (v.t === 'float') return { t: 'int', v: 8 };
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

    const x = this.toNum(a);
    const y = this.toNum(b);
    const float = a.t === 'float' || b.t === 'float';
    const num = (v: number): RV => (float ? { t: 'float', v } : { t: 'int', v: Math.abs(v) > 2147483647 ? v : v | 0 });
    switch (op) {
      case '+':
        return num(x + y);
      case '-':
        return num(x - y);
      case '*':
        return float ? num(x * y) : num(Math.abs(x * y) > 2 ** 53 ? Math.imul(x, y) : x * y);
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
      const v = this.makeDefault(ty, 'heap', null) as RV & { t: 'agg' };
      v.b.region = 'heap';
      v.b.addr = this.nextHeap;
      this.nextHeap += Math.max(16, Math.ceil(sizeOf(ty, this.program.structs) / 16) * 16);
      if (e.args) this.fillFromList(v.b, e.args);
      return { t: 'ptr', b: v.b, o: 0, ty };
    }
    const init = e.args?.[0] ? this.coerce(this.evalR(e.args[0]), ty) : e.args ? this.makeDefault(ty, 'heap', null, true) : this.makeDefault(ty, 'heap', null);
    const b = this.alloc('scalar', 'heap', ty, [init]);
    return { t: 'ptr', b, o: 0, ty };
  }

  private retype(b: Block, ty: TypeInfo) {
    const bytes = b.items.length;
    const n = Math.max(1, Math.floor(bytes / sizeOf(ty, this.program.structs)));
    b.elemType = ty;
    b.kind = 'array';
    b.items = Array.from({ length: n }, () => (b.items[0]?.t === 'int' ? this.coerce({ t: 'int', v: 0 }, ty) : { t: 'uninit', ty }));
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
    if (b.kind === 'array') {
      if (items.length > b.items.length) throw new RuntimeErr('OutOfBounds', 'Too many initializers', `The list has ${items.length} values but the array only has room for ${b.items.length}.`);
      for (let i = 0; i < b.items.length; i++) b.items[i] = i < items.length ? val(items[i]!, b.elemType) : this.makeDefault(b.elemType, b.region, null, true);
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
    if (fn) {
      const args = fn.params.map((p, i) => {
        const a = e.args[i];
        if (!a) throw new RuntimeErr('TypeError', 'Missing argument', `${name}() needs ${fn.params.length} arguments but got ${e.args.length}.`);
        if (p.type.ref && this.isLValue(a)) return this.evalL(a);
        return this.evalR(a);
      });
      if (e.args.length > fn.params.length) throw new RuntimeErr('TypeError', 'Too many arguments', `${name}() takes ${fn.params.length} arguments but got ${e.args.length}.`);
      return this.callFunction(fn, args, e.line);
    }
    return this.builtin(name, e.args);
  }

  private callFunction(fn: FunctionDef, args: (RV | LV)[], callLine: number): RV {
    if (this.stack.length >= 256) {
      throw new RuntimeErr('StackOverflow', 'Stack overflow', `Too many nested calls (over 256). ${fn.name}() keeps calling itself.`, 'The recursion never reached a base case, so calls kept piling up until the stack ran out of room.');
    }
    const caller = this.stack[this.stack.length - 1];
    if (caller) caller.line = callLine;
    const scope: Scope = { vars: new Map(), owned: [] };
    const frame: CallFrame = { id: `f${this.stack.length}`, name: fn.name, line: fn.line, scopes: [scope] };

    // Evaluate parameter storage before pushing, so it belongs to the callee.
    const bindings: [string, LV][] = fn.params.map((p, i) => {
      const a = args[i]!;
      if (!('t' in a)) return [p.name, a];
      if (a.t === 'agg' && !p.type.ptr) {
        const copy = this.copyAgg(a.b, 'stack', scope.owned);
        return [p.name, { b: copy, whole: true }];
      }
      const v = a.t === 'agg' && a.b.kind === 'array' ? ({ t: 'ptr', b: a.b, o: 0, ty: a.b.elemType } as RV) : a;
      const b = this.alloc('scalar', 'stack', p.type, [this.coerce(v, p.type)]);
      scope.owned.push(b);
      return [p.name, { b, i: 0 }];
    });
    for (const [n, lv] of bindings) scope.vars.set(n, lv);

    this.stack.push(frame);
    // On an error the frame is left on the stack, so the exception step shows it.
    let result: RV = { t: 'void' };
    this.record(fn.line, 'call');
    try {
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

  private callMethod(m: Expr & { type: 'Member' }, argExprs: Expr[]): RV | LV {
    const objV = this.evalR(m.object);
    const name = this.exprName(m.object);
    const args = () => argExprs.map((a) => this.evalR(a));
    if (objV.t === 'str') {
      const s = objV.v;
      switch (m.name) {
        case 'size':
        case 'length':
          return { t: 'int', v: s.length };
        case 'empty':
          return { t: 'bool', v: s.length === 0 };
        case 'substr': {
          const [pos, len] = args().map((v) => this.toNum(v));
          return { t: 'str', v: s.substr(pos ?? 0, len) };
        }
        case 'c_str':
          return objV;
        case 'push_back':
        case 'append': {
          const lv = this.evalL(m.object);
          const add = args()[0]!;
          this.write(lv, { t: 'str', v: s + (add.t === 'char' ? String.fromCharCode(add.v) : add.t === 'str' ? add.v : '') });
          return { t: 'void' };
        }
      }
      throw new RuntimeErr('Unsupported', 'Unsupported method', `std::string.${m.name}() isn't supported yet.`);
    }
    if (objV.t !== 'agg' || objV.b.kind === 'struct' || objV.b.kind === 'array') {
      throw new RuntimeErr('Unsupported', 'Unsupported method', `${name ?? 'This value'} has no method ${m.name}().`);
    }
    const b = objV.b;
    const kindLabel = b.kind === 'cpp_stack' ? 'stack' : b.kind === 'cpp_queue' ? 'queue' : 'vector';
    const empty = (what: string) =>
      new RuntimeErr('EmptyContainer', `${what} on an empty ${kindLabel}`, `${name ?? kindLabel}.${what} was called, but ${name ?? `the ${kindLabel}`} is empty.`, `There is nothing in ${name ? `'${name}'` : `the ${kindLabel}`} to ${what.replace('()', '')}. Check empty() first.`);
    const put = (v: RV) => {
      const stored = v.t === 'agg' ? ({ t: 'agg', b: this.copyAgg(v.b, 'heap', null) } as RV) : this.coerce(v, b.elemType);
      b.items.push(stored);
    };

    switch (m.name) {
      case 'size':
        return { t: 'int', v: b.items.length };
      case 'empty':
        return { t: 'bool', v: b.items.length === 0 };
      case 'clear':
        b.items = [];
        return { t: 'void' };
      case 'push_back':
      case 'emplace_back':
      case 'push':
      case 'emplace':
        put(args()[0]!);
        return { t: 'void' };
    }

    if (b.kind === 'vector') {
      switch (m.name) {
        case 'pop_back':
          if (!b.items.length) throw empty('pop_back()');
          b.items.pop();
          return { t: 'void' };
        case 'back':
          if (!b.items.length) throw empty('back()');
          return { b, i: b.items.length - 1, name };
        case 'front':
          if (!b.items.length) throw empty('front()');
          return { b, i: 0, name };
        case 'at':
          return { b, i: this.toNum(args()[0]!), name };
        case 'begin':
          return { t: 'ptr', b, o: 0, ty: b.elemType };
        case 'end':
          return { t: 'ptr', b, o: b.items.length, ty: b.elemType };
        case 'resize': {
          const [n, fill] = args();
          const count = this.toNum(n!);
          while (b.items.length > count) b.items.pop();
          while (b.items.length < count) b.items.push(fill ? this.coerce(fill, b.elemType) : this.makeDefault(b.elemType, 'heap', null, true));
          return { t: 'void' };
        }
      }
    }
    if (b.kind === 'cpp_stack') {
      switch (m.name) {
        case 'pop':
          if (!b.items.length) throw empty('pop()');
          b.items.pop();
          return { t: 'void' };
        case 'top':
          if (!b.items.length) throw empty('top()');
          return { b, i: b.items.length - 1, name };
      }
    }
    if (b.kind === 'cpp_queue') {
      switch (m.name) {
        case 'pop':
          if (!b.items.length) throw empty('pop()');
          b.items.shift();
          return { t: 'void' };
        case 'front':
          if (!b.items.length) throw empty('front()');
          return { b, i: 0, name };
        case 'back':
          if (!b.items.length) throw empty('back()');
          return { b, i: b.items.length - 1, name };
      }
    }
    throw new RuntimeErr('Unsupported', 'Unsupported method', `std::${kindLabel}.${m.name}() isn't supported yet.`);
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
        const [a, b] = args();
        const pick = name === 'max' ? this.toNum(a!) >= this.toNum(b!) : this.toNum(a!) <= this.toNum(b!);
        return pick ? a! : b!;
      }
      case 'swap': {
        const a = this.evalL(argExprs[0]!);
        const b = this.evalL(argExprs[1]!);
        const va = this.read(a);
        const vb = this.read(b);
        if (va.t === 'agg' || vb.t === 'agg') throw new RuntimeErr('Unsupported', 'Unsupported feature', 'swap() of whole containers or structs is not supported yet.');
        this.write(a, vb);
        this.write(b, va);
        return { t: 'void' };
      }
      case 'sort':
      case 'reverse': {
        const [from, to] = args();
        if (from?.t !== 'ptr' || to?.t !== 'ptr' || !from.b || from.b !== to.b) throw new RuntimeErr('TypeError', `Invalid ${name}() range`, `${name}() needs a range like (v.begin(), v.end()) or (arr, arr + n).`);
        const b = from.b;
        const slice = b.items.slice(from.o, to.o);
        if (name === 'sort') slice.sort((x, y) => this.toNum(x) - this.toNum(y));
        else slice.reverse();
        b.items.splice(from.o, slice.length, ...slice);
        return { t: 'void' };
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
        case 'u':
          s = String(Math.trunc(this.toNum(v)));
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
          s = (this.toNum(v) >>> 0).toString(16);
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
      const ty = cur?.t === 'uninit' ? cur.ty : 'f' in lv ? this.fieldType(lv.b, lv.f) : lv.b.elemType;
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
        this.step(s.line);
        this.execDecl(s, frame.scopes[frame.scopes.length - 1]!, 'stack');
        return;
      case 'ExprStmt':
        this.step(s.line);
        this.evalR(s.expr);
        return;
      case 'Return':
        this.step(s.line);
        throw new ReturnSignal(s.value ? this.evalR(s.value) : { t: 'void' });
      case 'Break':
        this.step(s.line);
        throw new BreakSignal();
      case 'Continue':
        this.step(s.line);
        throw new ContinueSignal();
      case 'Delete':
        this.step(s.line);
        this.free(this.evalR(s.arg), 'delete');
        return;
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
        const it = this.evalR(s.iterable);
        if (it.t !== 'agg' || it.b.kind === 'struct') throw new RuntimeErr('TypeError', 'Not iterable', 'A range-based for loop needs an array or container.');
        const b = it.b;
        let i = 0;
        this.loopCounts.set(s, 0);
        this.withScope(frame, () => {
          const scope = frame.scopes[frame.scopes.length - 1]!;
          for (;;) {
            if (i > 0) this.step(s.line);
            if (i >= b.items.length) break;
            if (s.decl.type.ref) scope.vars.set(s.decl.name, { b, i });
            else {
              const ty = s.decl.type.base === 'auto' ? b.elemType : s.decl.type;
              const cell = this.alloc('scalar', 'stack', ty, [this.coerce(b.items[i]!, ty)]);
              scope.owned.push(cell);
              const old = scope.vars.get(s.decl.name);
              if (old) {
                old.b.dead = true;
                this.blocks.delete(old.b.id);
              }
              scope.vars.set(s.decl.name, { b: cell, i: 0 });
            }
            this.iterate(s);
            i++;
            if (this.runBody(s.body, frame) === 'break') break;
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
      if (!first) this.step(s.line); // back at the loop header before re-checking
      first = false;
      if (!test()) break;
      this.iterate(s);
      if (this.runBody(body, frame) === 'break') break;
      update?.();
    }
  }

  private execDecl(s: Stmt & { type: 'Decl' }, scope: Scope, region: 'stack' | 'static') {
    for (const d of s.decls) this.declare(d, scope, region);
  }

  private declare(d: Declarator, scope: Scope, region: 'stack' | 'static') {
    const zero = region === 'static';
    const ty = d.type;

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
      const n = d.arraySize ? this.toNum(this.evalR(d.arraySize)) : list ? list.length : strInit !== null ? strInit.length + 1 : 0;
      if (n < 0) throw new RuntimeErr('BadAlloc', 'Invalid array size', `Array '${d.name}' cannot have size ${n}.`);
      const items = Array.from({ length: n }, () => this.makeDefault(ty, region, scope.owned, zero));
      const b = this.alloc('array', region, ty, items);
      scope.owned.push(b);
      if (list) this.fillFromList(b, list);
      else if (strInit !== null) [...strInit, '\0'].forEach((c, i) => i < n && (b.items[i] = { t: 'char', v: c.charCodeAt(0) }));
      scope.vars.set(d.name, { b, whole: true });
      return;
    }

    // Aggregates: structs and containers live in their own block.
    let init: RV | undefined;
    if (d.init && d.init.type !== 'InitList') init = this.evalR(d.init);
    const resolved: TypeInfo = ty.base === 'auto' && init ? this.typeOfValue(init) : ty;

    if (!resolved.ptr && (CONTAINERS.has(resolved.base) || this.program.structs.has(resolved.base))) {
      let b: Block;
      if (init?.t === 'agg') b = this.copyAgg(init.b, region, scope.owned);
      else {
        b = (this.makeDefault(resolved, region, scope.owned, zero) as RV & { t: 'agg' }).b;
        if (d.init?.type === 'InitList') this.fillFromList(b, d.init.items);
        else if (d.ctorArgs?.length) {
          if (b.kind !== 'vector') throw new RuntimeErr('Unsupported', 'Unsupported feature', `Constructor arguments are only supported for std::vector.`);
          const [n, fill] = d.ctorArgs.map((a) => this.evalR(a));
          b.items = Array.from({ length: this.toNum(n!) }, () => (fill ? this.coerce(fill, b.elemType) : this.makeDefault(b.elemType, 'heap', null, true)));
        }
      }
      scope.vars.set(d.name, { b, whole: true });
      return;
    }

    // Scalars and pointers.
    let value: RV;
    if (d.init?.type === 'InitList') value = d.init.items[0] ? this.evalR(d.init.items[0]) : this.makeDefault(resolved, region, null, true);
    else if (d.ctorArgs?.length) value = this.evalR(d.ctorArgs[0]!);
    else value = init ?? this.makeDefault(resolved, region, null, zero);
    if (value.t === 'agg' && value.b.kind === 'array') value = { t: 'ptr', b: value.b, o: 0, ty: value.b.elemType };
    if (value.t === 'ptr' && resolved.ptr && value.b?.elemType.base === 'byte') this.retype(value.b, this.pointee(resolved));
    const b = this.alloc('scalar', region, resolved, [this.coerce(value, resolved)]);
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
        return v.b.kind === 'struct' ? { ...INT_TYPE, base: v.b.struct!.name } : { ...INT_TYPE, base: v.b.kind === 'cpp_stack' ? 'stack' : v.b.kind === 'cpp_queue' ? 'queue' : 'vector', args: [v.b.elemType] };
      default:
        return INT_TYPE;
    }
  }
}

import { CompileError, Token, tokenize } from './lexer';

// ---- Types ----

export interface TypeInfo {
  base: string; // "int", "double", "Node", "string", "vector"...
  args: TypeInfo[]; // template arguments
  ptr: number; // pointer depth
  ref: boolean;
  unsigned?: boolean;
}

export const CONTAINERS = new Set(['vector', 'stack', 'queue', 'deque']);

export function typeName(t: TypeInfo): string {
  let s = t.unsigned && t.base !== 'size_t' ? `unsigned ${t.base}` : t.base;
  if (CONTAINERS.has(t.base) || t.base === 'string') s = `std::${s}`;
  if (t.args.length) s += `<${t.args.map(typeName).join(', ')}>`;
  return s + '*'.repeat(t.ptr) + (t.ref ? '&' : '');
}

// ---- AST ----

export type Expr =
  | { type: 'Num'; line: number; value: number; float: boolean }
  | { type: 'Str'; line: number; value: string }
  | { type: 'Char'; line: number; value: number }
  | { type: 'Bool'; line: number; value: boolean }
  | { type: 'Null'; line: number }
  | { type: 'Ident'; line: number; name: string }
  | { type: 'Unary'; line: number; op: string; arg: Expr }
  | { type: 'Update'; line: number; op: '++' | '--'; prefix: boolean; arg: Expr }
  | { type: 'Binary'; line: number; op: string; left: Expr; right: Expr }
  | { type: 'Logical'; line: number; op: '&&' | '||'; left: Expr; right: Expr }
  | { type: 'Assign'; line: number; op: string; target: Expr; value: Expr }
  | { type: 'Ternary'; line: number; test: Expr; then: Expr; else: Expr }
  | { type: 'Call'; line: number; callee: Expr; args: Expr[] }
  | { type: 'Index'; line: number; object: Expr; index: Expr }
  | { type: 'Member'; line: number; object: Expr; name: string; arrow: boolean }
  | { type: 'Cast'; line: number; to: TypeInfo; arg: Expr }
  | { type: 'SizeofType'; line: number; of: TypeInfo }
  | { type: 'New'; line: number; of: TypeInfo; count?: Expr; args?: Expr[] }
  | { type: 'InitList'; line: number; items: Expr[] }
  | { type: 'Comma'; line: number; items: Expr[] };

export interface Declarator {
  name: string;
  type: TypeInfo;
  arraySize?: Expr | null; // null = "[]" (size from initializer)
  init?: Expr;
  ctorArgs?: Expr[]; // vector<int> v(5, 0)
  line: number;
}

export type Stmt =
  | { type: 'Block'; line: number; body: Stmt[]; endLine: number }
  | { type: 'Decl'; line: number; decls: Declarator[] }
  | { type: 'ExprStmt'; line: number; expr: Expr }
  | { type: 'If'; line: number; test: Expr; then: Stmt; else?: Stmt }
  | { type: 'While'; line: number; test: Expr; body: Stmt }
  | { type: 'DoWhile'; line: number; body: Stmt; test: Expr; testLine: number }
  | { type: 'For'; line: number; init?: Stmt; test?: Expr; update?: Expr; body: Stmt }
  | { type: 'RangeFor'; line: number; decl: Declarator; iterable: Expr; body: Stmt }
  | { type: 'Return'; line: number; value?: Expr }
  | { type: 'Break'; line: number }
  | { type: 'Continue'; line: number }
  | { type: 'Delete'; line: number; arg: Expr; array: boolean }
  | { type: 'Switch'; line: number; test: Expr; cases: { test?: Expr; line: number; body: Stmt[] }[] }
  | { type: 'Empty'; line: number };

export interface Param {
  name: string;
  type: TypeInfo;
}

export interface FunctionDef {
  name: string;
  returnType: TypeInfo;
  params: Param[];
  body: Stmt & { type: 'Block' };
  line: number;
}

export interface StructDef {
  name: string;
  fields: { name: string; type: TypeInfo; arraySize?: Expr | null; init?: Expr }[];
}

export interface Program {
  functions: Map<string, FunctionDef>;
  structs: Map<string, StructDef>;
  globals: Stmt[];
}

// ---- Parser ----

const BASE_TYPES = new Set([
  'int', 'char', 'short', 'long', 'float', 'double', 'bool', 'void', 'unsigned', 'signed',
  'auto', 'size_t', 'string',
]);
const QUALIFIERS = new Set(['const', 'static', 'struct', 'inline', 'volatile', 'register', 'constexpr']);
const UNSUPPORTED: Record<string, string> = {
  template: "Tracel's C++ engine doesn't support templates you define yourself yet. Built-in std::vector, std::stack and std::queue are supported.",
  class: "Tracel's C++ engine doesn't support classes yet. Use a struct with fields (no member functions).",
  goto: "Tracel's C/C++ engine does not support goto statements.",
  operator: "Tracel's C++ engine doesn't support operator overloading yet.",
  try: "Tracel's C++ engine doesn't support exceptions (try/catch) yet.",
  throw: "Tracel's C++ engine doesn't support exceptions (throw) yet.",
  union: "Tracel's C/C++ engine doesn't support unions yet.",
  enum: "Tracel's C/C++ engine doesn't support enums yet.",
};

export function parseProgram(source: string): Program {
  return new Parser(tokenize(source)).program();
}

class Parser {
  private pos = 0;
  private structs = new Map<string, StructDef>();
  private typedefs = new Map<string, TypeInfo>();

  constructor(private tokens: Token[]) {}

  // -- token helpers --

  private peek(offset = 0): Token {
    return this.tokens[Math.min(this.pos + offset, this.tokens.length - 1)]!;
  }
  private next(): Token {
    const t = this.peek();
    if (this.pos < this.tokens.length - 1) this.pos++;
    return t;
  }
  private is(text: string, offset = 0): boolean {
    const t = this.peek(offset);
    return (t.kind === 'op' || t.kind === 'id') && t.text === text;
  }
  private accept(text: string): boolean {
    if (this.is(text)) {
      this.pos++;
      return true;
    }
    return false;
  }
  private expect(text: string): Token {
    if (!this.is(text)) {
      const t = this.peek();
      const found = t.kind === 'eof' ? 'end of file' : `'${t.text}'`;
      throw new CompileError(`Expected '${text}' but found ${found}`, t.line, t.col);
    }
    return this.next();
  }
  private ident(): string {
    const t = this.peek();
    if (t.kind !== 'id') throw new CompileError(`Expected a name but found '${t.text || 'end of file'}'`, t.line, t.col);
    this.pos++;
    return t.text;
  }
  private checkUnsupported(t: Token) {
    if (t.kind === 'id' && UNSUPPORTED[t.text]) throw new CompileError(UNSUPPORTED[t.text]!, t.line, t.col, 'unsupported');
  }

  // -- types --

  /** Is the token at `offset` the start of a type (skipping std:: and qualifiers)? */
  private isTypeStart(offset = 0): boolean {
    let t = this.peek(offset);
    while (t.kind === 'id' && QUALIFIERS.has(t.text)) t = this.peek(++offset);
    if (t.kind === 'id' && t.text === 'std' && this.is('::', offset + 1)) t = this.peek((offset += 2));
    if (t.kind !== 'id') return false;
    return BASE_TYPES.has(t.text) || CONTAINERS.has(t.text) || this.structs.has(t.text) || this.typedefs.has(t.text);
  }

  private baseType(): TypeInfo {
    while (this.peek().kind === 'id' && QUALIFIERS.has(this.peek().text)) this.pos++;
    if (this.is('std') && this.is('::', 1)) this.pos += 2;
    const start = this.peek();
    let unsigned = false;
    const words: string[] = [];
    while (this.peek().kind === 'id' && ['unsigned', 'signed', 'long', 'short'].includes(this.peek().text)) {
      const w = this.next().text;
      if (w === 'unsigned') unsigned = true;
      else if (w !== 'signed') words.push(w);
    }
    let base: string;
    if (this.peek().kind === 'id' && ['int', 'char', 'double'].includes(this.peek().text) && words.length) {
      const word = this.next().text;
      base = word === 'int' ? words.join(' ') : word;
    } else if (words.length) {
      base = words.join(' ');
    } else if (unsigned && !this.isTypeStart()) {
      base = 'int';
    } else {
      base = this.ident();
    }
    const typedef = this.typedefs.get(base);
    if (typedef) return { ...typedef, args: [...typedef.args] };
    const t: TypeInfo = { base, args: [], ptr: 0, ref: false, unsigned };
    if (CONTAINERS.has(base)) {
      this.expect('<');
      t.args.push(this.fullType());
      while (this.accept(',')) t.args.push(this.fullType());
      this.closeAngle();
    } else if (!BASE_TYPES.has(base) && !this.structs.has(base)) {
      throw new CompileError(`Unknown type '${base}'`, start.line, start.col);
    }
    while (this.peek().kind === 'id' && this.peek().text === 'const') this.pos++;
    return t;
  }

  /** Closes a template argument list, splitting ">>" when nested. */
  private closeAngle() {
    if (this.is('>>')) {
      const t = this.peek();
      this.tokens.splice(this.pos, 1, { ...t, text: '>' }, { ...t, text: '>', col: t.col + 1 });
    }
    this.expect('>');
  }

  private fullType(): TypeInfo {
    const t = this.baseType();
    this.pointerSuffix(t);
    return t;
  }

  private pointerSuffix(t: TypeInfo) {
    for (;;) {
      if (this.accept('*')) t.ptr++;
      else if (this.accept('&')) t.ref = true;
      else if (this.accept('const')) continue;
      else break;
    }
  }

  private declarator(base: TypeInfo): Declarator {
    const type: TypeInfo = { ...base, args: base.args };
    const line = this.peek().line;
    this.pointerSuffix(type);
    const name = this.ident();
    const d: Declarator = { name, type, line };
    if (this.accept('[')) {
      d.arraySize = this.is(']') ? null : this.expr();
      this.expect(']');
      if (this.is('[')) {
        const t = this.peek();
        throw new CompileError("Tracel's C/C++ engine doesn't support multi-dimensional arrays yet. Try a vector of vectors.", t.line, t.col, 'unsupported');
      }
    }
    if (this.accept('=')) d.init = this.is('{') ? this.initList() : this.assignment();
    else if (this.is('{')) d.init = this.initList();
    else if (this.is('(')) {
      this.next();
      d.ctorArgs = [];
      if (!this.is(')')) {
        d.ctorArgs.push(this.assignment());
        while (this.accept(',')) d.ctorArgs.push(this.assignment());
      }
      this.expect(')');
    }
    return d;
  }

  // -- top level --

  program(): Program {
    const functions = new Map<string, FunctionDef>();
    const globals: Stmt[] = [];
    while (this.peek().kind !== 'eof') {
      this.checkUnsupported(this.peek());
      if (this.accept(';')) continue;
      if (this.is('using')) {
        while (!this.accept(';')) this.next();
        continue;
      }
      if (this.is('typedef')) {
        this.typedef();
        continue;
      }
      if (this.is('struct') && this.peek(1).kind === 'id' && (this.is('{', 2) || this.is(';', 2))) {
        this.next();
        this.structBody(this.ident());
        this.expect(';');
        continue;
      }
      const start = this.peek();
      if (!this.isTypeStart()) throw new CompileError(`Unexpected '${start.text}' at the top level`, start.line, start.col);
      const base = this.baseType();
      const save = this.pos;
      const retType = { ...base };
      this.pointerSuffix(retType);
      if (this.peek().kind === 'id' && this.is('(', 1)) {
        const name = this.ident();
        const params = this.params();
        if (this.accept(';')) continue; // prototype
        const body = this.block();
        functions.set(name, { name, returnType: retType, params, body, line: start.line });
        continue;
      }
      this.pos = save;
      globals.push(this.declRest(base, start.line));
    }
    return { functions, structs: this.structs, globals };
  }

  private typedef() {
    this.expect('typedef');
    if (this.is('struct') && (this.is('{', 1) || (this.peek(1).kind === 'id' && this.is('{', 2)))) {
      this.next();
      const tag = this.peek().kind === 'id' ? this.ident() : `__anon${this.pos}`;
      this.structBody(tag);
      const alias = this.ident();
      this.typedefs.set(alias, { base: tag, args: [], ptr: 0, ref: false });
      if (alias !== tag) this.structs.set(alias, this.structs.get(tag)!);
      this.expect(';');
      return;
    }
    const t = this.fullType();
    this.typedefs.set(this.ident(), t);
    this.expect(';');
  }

  private structBody(name: string) {
    const def: StructDef = { name, fields: [] };
    this.structs.set(name, def); // registered first so fields can be Node*
    if (!this.accept('{')) return;
    while (!this.accept('}')) {
      this.checkUnsupported(this.peek());
      const base = this.baseType();
      do {
        const d = this.declarator(base);
        if (this.is('(') || d.ctorArgs) {
          const t = this.peek();
          throw new CompileError("Tracel's C++ engine doesn't support member functions or constructors yet. Use plain fields and set them after creating the struct.", t.line, t.col, 'unsupported');
        }
        def.fields.push({ name: d.name, type: d.type, arraySize: d.arraySize, init: d.init });
      } while (this.accept(','));
      this.expect(';');
    }
  }

  private params(): Param[] {
    this.expect('(');
    const params: Param[] = [];
    if (this.is('void') && this.is(')', 1)) this.next();
    while (!this.accept(')')) {
      if (params.length) this.expect(',');
      const type = this.fullType();
      const name = this.peek().kind === 'id' ? this.ident() : `arg${params.length}`;
      if (this.accept('[')) {
        while (!this.accept(']')) this.next();
        type.ptr++;
      }
      params.push({ name, type });
    }
    return params;
  }

  // -- statements --

  private block(): Stmt & { type: 'Block' } {
    const line = this.expect('{').line;
    const body: Stmt[] = [];
    while (!this.is('}')) {
      if (this.peek().kind === 'eof') throw new CompileError("Missing '}' to close this block", line, 0);
      body.push(this.statement());
    }
    const endLine = this.next().line;
    return { type: 'Block', line, body, endLine };
  }

  private declRest(base: TypeInfo, line: number): Stmt {
    const decls: Declarator[] = [];
    do decls.push(this.declarator(base));
    while (this.accept(','));
    this.expect(';');
    return { type: 'Decl', line, decls };
  }

  private statement(): Stmt {
    const t = this.peek();
    const line = t.line;
    this.checkUnsupported(t);
    if (t.kind === 'op' && t.text === '{') return this.block();
    if (this.accept(';')) return { type: 'Empty', line };

    if (t.kind === 'id') {
      switch (t.text) {
        case 'if': {
          this.next();
          this.expect('(');
          const test = this.expr();
          this.expect(')');
          const then = this.statement();
          const els = this.accept('else') ? this.statement() : undefined;
          return { type: 'If', line, test, then, else: els };
        }
        case 'while': {
          this.next();
          this.expect('(');
          const test = this.expr();
          this.expect(')');
          return { type: 'While', line, test, body: this.statement() };
        }
        case 'do': {
          this.next();
          const body = this.statement();
          const testLine = this.expect('while').line;
          this.expect('(');
          const test = this.expr();
          this.expect(')');
          this.expect(';');
          return { type: 'DoWhile', line, body, test, testLine };
        }
        case 'for':
          return this.forStatement();
        case 'return': {
          this.next();
          const value = this.is(';') ? undefined : this.expr();
          this.expect(';');
          return { type: 'Return', line, value };
        }
        case 'break':
          this.next();
          this.expect(';');
          return { type: 'Break', line };
        case 'continue':
          this.next();
          this.expect(';');
          return { type: 'Continue', line };
        case 'delete': {
          this.next();
          const array = this.accept('[');
          if (array) this.expect(']');
          const arg = this.expr();
          this.expect(';');
          return { type: 'Delete', line, arg, array };
        }
        case 'switch':
          return this.switchStatement();
      }
    }

    if (this.isTypeStart() && !(this.peek(1).kind === 'op' && ['(', '::'].includes(this.peek(1).text) && BASE_TYPES.has(t.text))) {
      return this.declRest(this.baseType(), line);
    }

    const expr = this.expr();
    this.expect(';');
    return { type: 'ExprStmt', line, expr };
  }

  private forStatement(): Stmt {
    const line = this.expect('for').line;
    this.expect('(');
    let init: Stmt | undefined;
    if (this.isTypeStart()) {
      const base = this.baseType();
      const save = this.pos;
      const type = { ...base };
      this.pointerSuffix(type);
      if (this.peek().kind === 'id' && this.is(':', 1)) {
        const name = this.ident();
        this.expect(':');
        const iterable = this.expr();
        this.expect(')');
        return { type: 'RangeFor', line, decl: { name, type, line }, iterable, body: this.statement() };
      }
      this.pos = save;
      init = this.declRest(base, line);
    } else if (!this.accept(';')) {
      init = { type: 'ExprStmt', line, expr: this.expr() };
      this.expect(';');
    }
    const test = this.is(';') ? undefined : this.expr();
    this.expect(';');
    const update = this.is(')') ? undefined : this.expr();
    this.expect(')');
    return { type: 'For', line, init, test, update, body: this.statement() };
  }

  private switchStatement(): Stmt {
    const line = this.expect('switch').line;
    this.expect('(');
    const test = this.expr();
    this.expect(')');
    this.expect('{');
    const cases: { test?: Expr; line: number; body: Stmt[] }[] = [];
    while (!this.accept('}')) {
      const caseLine = this.peek().line;
      if (this.accept('case')) {
        const value = this.ternary();
        this.expect(':');
        cases.push({ test: value, line: caseLine, body: [] });
      } else if (this.accept('default')) {
        this.expect(':');
        cases.push({ line: caseLine, body: [] });
      } else {
        if (!cases.length) throw new CompileError("Expected 'case' inside switch", caseLine, 0);
        cases[cases.length - 1]!.body.push(this.statement());
      }
    }
    return { type: 'Switch', line, test, cases };
  }

  // -- expressions --

  expr(): Expr {
    const first = this.assignment();
    if (!this.is(',')) return first;
    const items = [first];
    while (this.accept(',')) items.push(this.assignment());
    return { type: 'Comma', line: first.line, items };
  }

  private initList(): Expr {
    const line = this.expect('{').line;
    const items: Expr[] = [];
    while (!this.accept('}')) {
      items.push(this.is('{') ? this.initList() : this.assignment());
      if (!this.is('}')) this.expect(',');
    }
    return { type: 'InitList', line, items };
  }

  private assignment(): Expr {
    const left = this.ternary();
    const t = this.peek();
    if (t.kind === 'op' && ['=', '+=', '-=', '*=', '/=', '%=', '<<=', '>>=', '&=', '|=', '^='].includes(t.text)) {
      this.next();
      const value = this.is('{') ? this.initList() : this.assignment();
      return { type: 'Assign', line: t.line, op: t.text, target: left, value };
    }
    return left;
  }

  private ternary(): Expr {
    const test = this.binary(0);
    if (!this.accept('?')) return test;
    const then = this.assignment();
    this.expect(':');
    return { type: 'Ternary', line: test.line, test, then, else: this.assignment() };
  }

  private static LEVELS: string[][] = [
    ['||'], ['&&'], ['|'], ['^'], ['&'], ['==', '!='], ['<', '>', '<=', '>='], ['<<', '>>'], ['+', '-'], ['*', '/', '%'],
  ];

  private binary(level: number): Expr {
    if (level >= Parser.LEVELS.length) return this.unary();
    let left = this.binary(level + 1);
    for (;;) {
      const t = this.peek();
      if (t.kind !== 'op' || !Parser.LEVELS[level]!.includes(t.text)) return left;
      this.next();
      const right = this.binary(level + 1);
      left =
        t.text === '&&' || t.text === '||'
          ? { type: 'Logical', line: t.line, op: t.text, left, right }
          : { type: 'Binary', line: t.line, op: t.text, left, right };
    }
  }

  private unary(): Expr {
    const t = this.peek();
    const line = t.line;
    if (t.kind === 'op') {
      if (t.text === '++' || t.text === '--') {
        this.next();
        return { type: 'Update', line, op: t.text, prefix: true, arg: this.unary() };
      }
      if (['!', '-', '+', '~', '*', '&'].includes(t.text)) {
        this.next();
        return { type: 'Unary', line, op: t.text, arg: this.unary() };
      }
      // C-style cast: (int) x, (Node*) p
      if (t.text === '(' && this.isTypeStart(1)) {
        const save = this.pos;
        this.next();
        const to = this.fullType();
        if (this.accept(')')) return { type: 'Cast', line, to, arg: this.unary() };
        this.pos = save;
      }
    }
    if (t.kind === 'id' && t.text === 'sizeof') {
      this.next();
      if (this.is('(') && this.isTypeStart(1)) {
        this.next();
        const of = this.fullType();
        this.expect(')');
        return { type: 'SizeofType', line, of };
      }
      return { type: 'Unary', line, op: 'sizeof', arg: this.unary() };
    }
    if (t.kind === 'id' && t.text === 'new') {
      this.next();
      const of = this.baseType();
      while (this.accept('*')) of.ptr++;
      const node: Expr & { type: 'New' } = { type: 'New', line, of };
      if (this.accept('[')) {
        node.count = this.expr();
        this.expect(']');
        if (this.is('{')) node.args = (this.initList() as Expr & { type: 'InitList' }).items;
      } else if (this.is('{')) {
        node.args = (this.initList() as Expr & { type: 'InitList' }).items;
      } else if (this.accept('(')) {
        node.args = [];
        while (!this.accept(')')) {
          if (node.args.length) this.expect(',');
          node.args.push(this.assignment());
        }
      }
      return node;
    }
    return this.postfix(this.primary());
  }

  private postfix(expr: Expr): Expr {
    for (;;) {
      const t = this.peek();
      if (t.kind !== 'op') return expr;
      if (t.text === '(') {
        this.next();
        const args: Expr[] = [];
        while (!this.accept(')')) {
          if (args.length) this.expect(',');
          args.push(this.assignment());
        }
        expr = { type: 'Call', line: t.line, callee: expr, args };
      } else if (t.text === '[') {
        this.next();
        const index = this.expr();
        this.expect(']');
        expr = { type: 'Index', line: t.line, object: expr, index };
      } else if (t.text === '.' || t.text === '->') {
        this.next();
        expr = { type: 'Member', line: t.line, object: expr, name: this.ident(), arrow: t.text === '->' };
      } else if (t.text === '++' || t.text === '--') {
        this.next();
        expr = { type: 'Update', line: t.line, op: t.text, prefix: false, arg: expr };
      } else {
        return expr;
      }
    }
  }

  private primary(): Expr {
    const t = this.next();
    const line = t.line;
    switch (t.kind) {
      case 'num': {
        const text = t.text.replace(/[uUlLfF]+$/, '');
        const isHex = /^0[xX]/.test(text);
        const float = !isHex && /[.eE]/.test(text);
        return { type: 'Num', line, value: isHex ? parseInt(text, 16) : Number(text), float };
      }
      case 'str': {
        let value = t.text;
        while (this.peek().kind === 'str') value += this.next().text; // "a" "b" concatenation
        return { type: 'Str', line, value };
      }
      case 'char':
        return { type: 'Char', line, value: t.text.charCodeAt(0) || 0 };
      case 'id': {
        this.checkUnsupported(t);
        if (t.text === 'true' || t.text === 'false') return { type: 'Bool', line, value: t.text === 'true' };
        if (t.text === 'nullptr' || t.text === 'NULL') return { type: 'Null', line };
        if (t.text === 'std' && this.accept('::')) return this.primary();
        // Functional cast: int(x), double(total)
        if (BASE_TYPES.has(t.text) && this.is('(')) {
          this.next();
          const arg = this.expr();
          this.expect(')');
          return { type: 'Cast', line, to: { base: t.text, args: [], ptr: 0, ref: false }, arg };
        }
        return { type: 'Ident', line, name: t.text };
      }
      case 'op':
        if (t.text === '(') {
          const e = this.expr();
          this.expect(')');
          return e;
        }
        if (t.text === '{') {
          this.pos--;
          return this.initList();
        }
        if (t.text === '[') {
          throw new CompileError("Tracel's C++ engine doesn't support lambdas yet.", t.line, t.col, 'unsupported');
        }
    }
    throw new CompileError(t.kind === 'eof' ? 'Unexpected end of file' : `Unexpected '${t.text}'`, t.line, t.col);
  }
}

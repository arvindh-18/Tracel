export type TokenKind = 'id' | 'num' | 'str' | 'char' | 'op' | 'eof';

export interface Token {
  kind: TokenKind;
  text: string;
  line: number;
  col: number;
  /** Character offsets of the token in the source. */
  pos: number;
  end: number;
}

// Headers the interpreter provides. Anything else (including "local.h") is rejected up front.
const KNOWN_HEADERS = new Set([
  'stdio.h', 'stdlib.h', 'string.h', 'math.h', 'stdbool.h', 'limits.h', 'stddef.h', 'stdint.h', 'ctype.h', 'time.h',
  'iostream', 'vector', 'stack', 'queue', 'string', 'algorithm', 'cmath', 'cstdio', 'cstdlib', 'cstring', 'climits',
  'cstddef', 'cstdint', 'iomanip', 'utility', 'bits/stdc++.h', 'map', 'unordered_map', 'set', 'unordered_set',
  'deque', 'functional', 'numeric', 'cctype', 'climits', 'cassert', 'assert.h',
]);

export class CompileError extends Error {
  constructor(
    message: string,
    public line: number,
    public col: number,
    public phase: 'parse' | 'unsupported' = 'parse'
  ) {
    super(message);
  }
}

// Longest first, so "<<=" wins over "<<" and "<".
const OPERATORS = [
  '<<=', '>>=', '...',
  '->', '++', '--', '<<', '>>', '<=', '>=', '==', '!=', '&&', '||',
  '+=', '-=', '*=', '/=', '%=', '&=', '|=', '^=', '::',
  '+', '-', '*', '/', '%', '<', '>', '=', '!', '&', '|', '^', '~',
  '?', ':', ';', ',', '.', '(', ')', '[', ']', '{', '}',
];

/** Splits C/C++ source into tokens. Preprocessor lines are skipped, except simple object-like #defines. */
export function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  const macros = new Map<string, Token[]>();
  let i = 0;
  let line = 1;
  let lineStart = 0;
  let atLineStart = true;

  let tokenStart = 0;
  const push = (kind: TokenKind, text: string, startLine: number, startCol: number) => {
    if (kind === 'id' && macros.has(text)) {
      for (const m of macros.get(text)!) tokens.push({ ...m, line: startLine, col: startCol, pos: tokenStart, end: i });
      return;
    }
    tokens.push({ kind, text, line: startLine, col: startCol, pos: tokenStart, end: i });
  };

  while (i < source.length) {
    const ch = source[i]!;

    if (ch === '\n') {
      i++;
      line++;
      lineStart = i;
      atLineStart = true;
      continue;
    }
    if (ch === ' ' || ch === '\t' || ch === '\r') {
      i++;
      continue;
    }

    // Preprocessor directive: consume to end of line (with backslash continuations).
    if (ch === '#' && atLineStart) {
      let end = i;
      while (end < source.length && source[end] !== '\n') {
        if (source[end] === '\\' && source[end + 1] === '\n') end += 2;
        else end++;
      }
      const directive = source.slice(i + 1, end).trim();
      const include = directive.match(/^include\s*([<"])([^>"]+)[>"]/);
      if (include) {
        if (include[1] === '"') {
          throw new CompileError(`Tracel runs a single file, so it can't include "${include[2]}". Put everything in this file.`, line, i - lineStart, 'unsupported');
        }
        if (!KNOWN_HEADERS.has(include[2]!.trim())) {
          throw new CompileError(`Tracel doesn't provide <${include[2]}>. Supported headers include <stdio.h>, <stdlib.h>, <string.h>, <math.h>, <iostream>, <vector>, <stack>, <queue>, <string> and <algorithm>.`, line, i - lineStart, 'unsupported');
        }
      }
      const define = directive.match(/^define\s+([A-Za-z_]\w*)(?!\()\s*(.*)$/);
      if (define) {
        const body = tokenize(define[2]!.replace(/\/\/.*$/, '')).filter((t) => t.kind !== 'eof');
        macros.set(define[1]!, body);
      }
      i = end;
      continue;
    }
    atLineStart = false;

    if (ch === '/' && source[i + 1] === '/') {
      while (i < source.length && source[i] !== '\n') i++;
      continue;
    }
    if (ch === '/' && source[i + 1] === '*') {
      i += 2;
      while (i < source.length && !(source[i] === '*' && source[i + 1] === '/')) {
        if (source[i] === '\n') {
          line++;
          lineStart = i + 1;
        }
        i++;
      }
      i += 2;
      continue;
    }

    const col = i - lineStart;
    const start = i;
    tokenStart = i;

    if (/[A-Za-z_]/.test(ch)) {
      while (i < source.length && /\w/.test(source[i]!)) i++;
      push('id', source.slice(start, i), line, col);
      continue;
    }

    if (/[0-9]/.test(ch) || (ch === '.' && /[0-9]/.test(source[i + 1] ?? ''))) {
      if (ch === '0' && /[xX]/.test(source[i + 1] ?? '')) {
        i += 2;
        while (/[0-9a-fA-F]/.test(source[i] ?? '')) i++;
      } else {
        while (/[0-9.]/.test(source[i] ?? '')) i++;
        if (/[eE]/.test(source[i] ?? '')) {
          i++;
          if (/[+-]/.test(source[i] ?? '')) i++;
          while (/[0-9]/.test(source[i] ?? '')) i++;
        }
      }
      while (/[uUlLfF]/.test(source[i] ?? '')) i++;
      push('num', source.slice(start, i), line, col);
      continue;
    }

    if (ch === '"' || ch === "'") {
      i++;
      let value = '';
      while (i < source.length && source[i] !== ch) {
        if (source[i] === '\n') throw new CompileError('Missing closing quote', line, col);
        if (source[i] === '\\') {
          const esc = source[i + 1]!;
          const map: Record<string, string> = { n: '\n', t: '\t', r: '\r', '0': '\0', '\\': '\\', "'": "'", '"': '"' };
          value += map[esc] ?? esc;
          i += 2;
        } else {
          value += source[i];
          i++;
        }
      }
      if (i >= source.length) throw new CompileError('Missing closing quote', line, col);
      i++;
      push(ch === '"' ? 'str' : 'char', value, line, col);
      continue;
    }

    const op = OPERATORS.find((o) => source.startsWith(o, i));
    if (!op) throw new CompileError(`Unexpected character '${ch}'`, line, col);
    i += op.length;
    push('op', op, line, col);
  }

  tokens.push({ kind: 'eof', text: '', line, col: i - lineStart, pos: i, end: i });
  return tokens;
}

import { Primitive, Value } from '../../../trace/schema';

export type CType =
  | 'int'
  | 'short'
  | 'long'
  | 'long long'
  | 'char'
  | 'bool'
  | 'float'
  | 'double'
  | 'size_t'
  | 'void';

export const C_SIZES: Record<CType, number> = {
  char: 1,
  bool: 1,
  short: 2,
  int: 4,
  long: 8,
  'long long': 8,
  float: 4,
  double: 8,
  size_t: 8,
  void: 0,
};

export function cInt32(n: number): number {
  return n | 0;
}

export function cIntMul(a: number, b: number): number {
  return Math.imul(a, b);
}

export function cIntDiv(a: number, b: number): number {
  if (b === 0) throw new Error('DivisionByZero: integer division by zero');
  return Math.trunc(a / b);
}

export function cIntMod(a: number, b: number): number {
  if (b === 0) throw new Error('DivisionByZero: modulo by zero');
  return a % b;
}

export function parsePrimitiveLiteral(raw: string): Primitive {
  const trimmed = raw.trim();
  if (trimmed === 'true') return { k: 'bool', v: true };
  if (trimmed === 'false') return { k: 'bool', v: false };
  if (trimmed === 'NULL' || trimmed === 'nullptr') return { k: 'none' };

  if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
    return { k: 'str', v: trimmed.slice(1, -1) };
  }
  if (trimmed.startsWith("'") && trimmed.endsWith("'")) {
    return { k: 'char', v: trimmed.charCodeAt(1) };
  }

  if (trimmed.includes('.') || trimmed.toLowerCase().includes('e')) {
    return { k: 'float', v: parseFloat(trimmed) };
  }

  const num = parseInt(trimmed, 10);
  if (!isNaN(num)) {
    return { k: 'int', v: String(cInt32(num)) };
  }

  return { k: 'int', v: '0' };
}


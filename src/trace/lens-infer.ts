import { HeapObject, LensKind } from './schema';

export interface PragmaAnnotation {
  varName: string;
  lens: LensKind;
}

export function parsePragmaAnnotations(source: string): Map<string, LensKind> {
  const map = new Map<string, LensKind>();
  const lines = source.split('\n');

  // Matches "# tracel: var = stack" or "// tracel: q = queue" or "# tracel:view stack"
  const pragmaRegex = /(?:#|\/\/)\s*tracel:(?:view\s+([a-z_]+)|(?:([a-zA-Z_]\w*)\s*=\s*([a-z_]+)))/i;

  for (const line of lines) {
    const match = line.match(pragmaRegex);
    if (match) {
      if (match[1]) {
        // e.g. # tracel:view stack -> apply to default/first var on line
        const lens = normalizeLensKind(match[1]);
        if (lens) map.set('*default*', lens);
      } else if (match[2] && match[3]) {
        const varName = match[2];
        const lens = normalizeLensKind(match[3]);
        if (lens) map.set(varName, lens);
      }
    }
  }

  return map;
}

function normalizeLensKind(raw: string): LensKind | null {
  const s = raw.toLowerCase().trim();
  if (s === 'array' || s === 'list') return 'array';
  if (s === 'stack') return 'stack';
  if (s === 'queue') return 'queue';
  if (s === 'linkedlist' || s === 'linked_list') return 'linked_list';
  if (s === 'tree') return 'tree';
  if (s === 'grid') return 'grid';
  if (s === 'dict' || s === 'map') return 'dict';
  if (s === 'set') return 'set';
  if (s === 'object' || s === 'struct') return 'object';
  return null;
}

export function inferLensKind(
  obj: HeapObject,
  associatedVarName?: string,
  pragmas?: Map<string, LensKind>,
  manualOverrides?: Map<string, LensKind>,
  /** Looks up other heap objects at the same step, for nested structures. */
  resolve?: (id: string) => Pick<HeapObject, 'items'> | undefined
): LensKind {
  // 1. Manual override
  if (associatedVarName && manualOverrides?.has(associatedVarName)) {
    return manualOverrides.get(associatedVarName)!;
  }

  // 2. Pragma annotations
  if (associatedVarName && pragmas?.has(associatedVarName)) {
    return pragmas.get(associatedVarName)!;
  }
  if (pragmas?.has('*default*')) {
    return pragmas.get('*default*')!;
  }

  // 3. Type inference
  if (obj.kind === 'cpp_stack') return 'stack';
  if (obj.kind === 'cpp_queue' || obj.kind === 'deque') return 'queue';
  if (obj.kind === 'dict') return 'dict';
  if (obj.kind === 'set') return 'set';

  // 2-D grid: a list/array of equal-length lists/arrays of primitives.
  if (resolve && obj.items && obj.items.length > 0 && obj.items.every((it) => it.k === 'ref' || it.k === 'inline')) {
    const rows = obj.items.map((it) => resolve((it as { id: string }).id)?.items);
    const width = rows[0]?.length ?? 0;
    const primitive = (v: { k: string }) => v.k !== 'ref' && v.k !== 'inline' && v.k !== 'ptr';
    if (width > 0 && rows.every((r) => r && r.length === width && r.every(primitive))) return 'grid';
  }

  // Check linked list / tree
  if (obj.kind === 'instance' || obj.kind === 'struct') {
    const fields = obj.fields ?? [];
    const refFields = fields.filter(([, v]) => v.k === 'ref' || v.k === 'ptr');
    const selfTypeRefs = refFields.filter(([name]) =>
      ['next', 'prev', 'left', 'right'].includes(name.toLowerCase())
    );

    if (selfTypeRefs.some(([n]) => n.toLowerCase() === 'left' || n.toLowerCase() === 'right')) {
      return 'tree';
    }
    if (selfTypeRefs.some(([n]) => n.toLowerCase() === 'next')) {
      return 'linked_list';
    }
    return 'object';
  }

  // 4. Name heuristics
  if (associatedVarName) {
    const name = associatedVarName.toLowerCase();
    if (name === 'stack' || name === 'stk' || name === 'st') return 'stack';
    if (name.includes('head')) {
      return 'linked_list';
    }
  }

  return 'array';
}

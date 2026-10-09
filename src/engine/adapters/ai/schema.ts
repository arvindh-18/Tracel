import { z } from 'zod';

// Gemini rejects deeply nested schemas, so values are one flat shape and
// every operation is one flat object whose `op` says which fields matter.

export const LENSES = ['array', 'stack', 'queue', 'linked_list', 'tree', 'grid', 'dict', 'object'] as const;

export const AiValue = z.object({
  k: z.enum(['int', 'float', 'bool', 'str', 'char', 'none', 'uninit', 'ptr', 'ref']),
  v: z.string().optional().describe('int/float as decimal text, bool as "true"/"false", str text, char the single character'),
  id: z.string().optional().describe('ptr/ref target: a block id from alloc, or "&name" for a variable; omit for nullptr'),
  offset: z.number().int().optional().describe('ptr only: element index into the target block'),
  t: z.string().optional().describe('ptr: pointee type, e.g. "int"; uninit: the declared type'),
});
export type AiValue = z.infer<typeof AiValue>;

export const OP_NAMES = [
  'call', 'return', 'declare', 'assign', 'alloc', 'free', 'write',
  'push', 'pop', 'enqueue', 'dequeue', 'push_back', 'pop_back',
  'print', 'read_input', 'error',
] as const;

export const AiOp = z.object({
  op: z.enum(OP_NAMES),
  fn: z.string().optional().describe('call: function name'),
  args: z.array(z.object({ name: z.string(), value: AiValue })).optional().describe('call: parameters in order'),
  name: z.string().optional().describe('declare/assign/read_input: variable name'),
  type: z.string().optional().describe('declare: C type; alloc: element or struct type'),
  value: AiValue.optional().describe('declare/assign/write/push/enqueue/push_back/read_input value; return value'),
  id: z.string().optional().describe('alloc: new block id; free/push/pop/...: target block id'),
  region: z.enum(['stack', 'heap']).optional(),
  kind: z
    .string()
    .optional()
    .describe('alloc: array | struct | vector | stack | queue. error: OutOfBounds | NullDereference | UseAfterFree | DoubleFree | UninitializedRead | DivisionByZero | StepLimit | Other'),
  count: z.number().int().optional().describe('alloc array: number of elements'),
  init: z.array(AiValue).optional().describe('alloc: initial items'),
  fields: z.array(z.object({ name: z.string(), value: AiValue })).optional().describe('alloc struct: fields in declaration order'),
  index: z.number().int().optional().describe('write: element index'),
  field: z.string().optional().describe('write: struct field name'),
  text: z.string().optional().describe('print: exact characters written to stdout'),
  message: z.string().optional().describe('error: what went wrong, for a beginner'),
});
export type AiOp = z.infer<typeof AiOp>;

export const AiStep = z.object({
  line: z.number().int().describe('1-based source line of the statement executed'),
  narration: z.string().optional().describe('what this step did, at most 80 characters'),
  ops: z.array(AiOp),
});

export const SimulateResult = z.object({
  steps: z.array(AiStep),
  lensHints: z.array(z.object({ name: z.string(), lens: z.enum(LENSES) })).optional(),
});
export type SimulateResult = z.infer<typeof SimulateResult>;

export const ExplainResult = z.object({
  overview: z.string().describe('2-3 sentences: what the whole program does'),
  narrations: z.array(z.string()).describe('one sentence per step, same order and count as the digest, at most 90 characters'),
  lensHints: z.array(z.object({ name: z.string(), lens: z.enum(LENSES) })).optional(),
});
export type ExplainResult = z.infer<typeof ExplainResult>;

export const ErrorHelp = z.object({
  explanation: z.string().describe('what went wrong and why, in plain words, 2-4 sentences'),
  fix: z.string().describe('a suggested fix: what to change, with a short corrected snippet if useful'),
});
export type ErrorHelp = z.infer<typeof ErrorHelp>;

/** JSON Schema for Gemini's structured output, without the keywords it rejects. */
export function geminiSchema(schema: z.ZodType): Record<string, unknown> {
  const json = z.toJSONSchema(schema, { target: 'draft-7' }) as Record<string, unknown>;
  const strip = (node: unknown): unknown => {
    if (Array.isArray(node)) return node.map(strip);
    if (!node || typeof node !== 'object') return node;
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(node)) {
      if (k === '$schema' || k === 'additionalProperties') continue;
      out[k] = strip(v);
    }
    return out;
  };
  return strip(json) as Record<string, unknown>;
}

/** Turns a zod failure into a short message the model can act on in a retry. */
export function describeIssues(error: z.ZodError): string {
  return error.issues
    .slice(0, 8)
    .map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`)
    .join('; ');
}

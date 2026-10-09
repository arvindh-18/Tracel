import { describe, expect, it } from 'vitest';
import { replay } from '../../src/engine/adapters/ai/replay';
import { SimulateResult } from '../../src/engine/adapters/ai/schema';
import { normalize } from '../../src/trace/normalize';
import { Trace } from '../../src/trace/schema';
import * as F from '../fixtures/ai';

const run = (result: SimulateResult, source: string, language: 'c' | 'cpp' = 'c', stepLimit = 500) => {
  const out = replay(result, { language, source, stepLimit });
  return { ...out, trace: normalize(out.rawTrace) };
};
const lastStep = (t: Trace) => t.steps[t.steps.length - 1]!;
const heapAt = (t: Trace, at = t.steps.length - 1) => Object.entries(t.steps[at]!.heap).map(([id, v]) => t.heapVersions[id]![v]!);
const locals = (t: Trace, at = t.steps.length - 1) => {
  const frames = t.steps[at]!.frames;
  return new Map(frames[frames.length - 1]!.locals);
};

describe('AI trace replayer', () => {
  it('replays a pointer swap: frames, pointers to variables and output 7 3', () => {
    const { trace, narrations } = run(F.SWAP, F.SWAP_SOURCE);
    expect(trace.status).toBe('completed');
    expect(trace.stdout).toBe('7 3\n');
    const inSwap = trace.steps.findIndex((s) => s.line === 5);
    expect(trace.steps[inSwap]!.frames.map((f) => f.name)).toEqual(['main', 'swap']);
    const a = locals(trace, inSwap).get('a')!;
    expect(a).toMatchObject({ k: 'ptr', id: 'x', t: 'int' });
    expect(new Map(trace.steps[inSwap]!.frames[0]!.locals).get('x')).toEqual({ k: 'int', v: '7' });
    expect(locals(trace, trace.steps.length - 2).get('y')).toEqual({ k: 'int', v: '3' });
    expect(narrations[2]).toBe('call swap');
    // main is entered on step 0, which has no previous step to diff against.
    expect(trace.steps.filter((s) => s.events.some((e) => e.type === 'call')).map((s) => s.line)).toEqual([9]);
  });

  it('replays an array sum loop with one step per statement', () => {
    const { trace } = run(F.ARRAY_SUM, F.ARRAY_SUM_SOURCE);
    expect(trace.status).toBe('completed');
    expect(locals(trace).get('sum')).toEqual({ k: 'int', v: '60' });
    const arr = heapAt(trace).find((o) => o.kind === 'array')!;
    expect(arr.typeName).toBe('int[3]');
    expect(arr.items).toEqual([10, 20, 30].map((v) => ({ k: 'int', v: String(v) })));
    expect(trace.steps.filter((s) => s.events.some((e) => e.type === 'var_update' && e.name === 'sum'))).toHaveLength(3);
  });

  it('replays a malloc/free linked list with pointer fields', () => {
    const { trace, lensHints } = run(F.LINKED_LIST, F.LINKED_LIST_SOURCE);
    expect(trace.status).toBe('completed');
    const linked = heapAt(trace, 4);
    const a = linked.find((o) => o.id === 'h2')!;
    expect(a.kind).toBe('struct');
    expect(new Map(a.fields).get('next')).toMatchObject({ k: 'ptr', id: 'h1' });
    expect(trace.lensHints.h2).toBe('linked_list');
    expect(lensHints).toEqual({ a: 'linked_list' });
    expect(heapAt(trace).every((o) => o.freed)).toBe(true);
    expect(trace.steps.some((s) => s.events.some((e) => e.type === 'field_set' && e.field === 'next'))).toBe(true);
  });

  it('replays std::vector, std::stack and std::queue operations as container events', () => {
    const { trace } = run(F.CONTAINERS, F.CONTAINERS_SOURCE, 'cpp');
    const kinds = Object.fromEntries(heapAt(trace).map((o) => [o.id, o.kind]));
    expect(kinds).toEqual({ h1: 'vector', h2: 'cpp_stack', h3: 'cpp_queue' });
    const ops = trace.steps.flatMap((s) => s.events.flatMap((e) => ('op' in e && e.op ? [e.op] : [])));
    expect(ops).toEqual(['append', 'push', 'push', 'pop', 'enqueue', 'enqueue', 'dequeue']);
    expect(Object.values(trace.lensHints)).toEqual(expect.arrayContaining(['stack', 'queue']));
    expect(heapAt(trace).find((o) => o.id === 'h3')!.items).toEqual([{ k: 'int', v: '9' }]);
  });

  it('stops an out-of-bounds write on its line, whether or not the model flagged it', () => {
    for (const fixture of [F.OOB_UNFLAGGED, F.OOB_FLAGGED]) {
      const { trace } = run(fixture, F.OOB_SOURCE);
      expect(trace.status).toBe('error');
      expect(trace.error).toMatchObject({ kind: 'OutOfBounds', line: 3, title: 'Index out of bounds' });
      expect(lastStep(trace).kind).toBe('exception');
    }
  });

  it('reports use-after-free when the model writes to a freed block', () => {
    const { trace } = run(F.USE_AFTER_FREE, F.LINKED_LIST_SOURCE);
    expect(trace.error).toMatchObject({ kind: 'UseAfterFree', line: 9 });
  });

  it('turns an impossible operation into a clean error instead of inventing state', () => {
    const { trace } = run(F.INVALID_OP, F.OOB_SOURCE);
    expect(trace.status).toBe('error');
    expect(trace.error).toMatchObject({ kind: 'InvalidAiTrace', line: 2 });
    expect(trace.error!.message).toContain("'h9'");
    expect(Object.keys(lastStep(trace).heap)).toEqual([]);
  });

  it('rejects line numbers outside the program and enforces the step cap', () => {
    const outside = run({ steps: [{ line: 99, ops: [] }] }, F.OOB_SOURCE).trace;
    expect(outside.error).toMatchObject({ kind: 'InvalidAiTrace' });
    const capped = run(F.ARRAY_SUM, F.ARRAY_SUM_SOURCE, 'c', 3).trace;
    expect(capped.status).toBe('limit');
    expect(capped.error?.kind).toBe('StepLimit');
  });
});

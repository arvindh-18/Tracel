import { spawnSync } from 'child_process';
import { describe, expect, it } from 'vitest';
import { PYTHON_TRACER_CODE } from '../../src/engine/adapters/python/pyRunner';
import { normalize, RawTrace } from '../../src/trace/normalize';

// The tracer is plain CPython code. Pyodide 0.26 ships CPython 3.12, so the
// same tracer runs here under a local python3 (skipped if none is installed).
const python = spawnSync('python3', ['--version']).status === 0 ? 'python3' : null;

function trace(source: string): RawTrace {
  const script = `${PYTHON_TRACER_CODE}\nimport sys as _s\n_s.stdout = _s.__stdout__\nprint(run_tracel(${JSON.stringify(source)}, "", 5000))\n`;
  const out = spawnSync(python!, ['-I', '-'], { input: script, encoding: 'utf8' });
  if (out.status !== 0) throw new Error(out.stderr);
  const parsed = JSON.parse(out.stdout.trim().split('\n').pop()!);
  return { language: 'python', source, ...parsed, error: parsed.error ?? undefined };
}

describe.skipIf(!python)('Python tracer', () => {
  it('blocks imports outside the allowlist with a clear error', () => {
    const t = trace('import os\nprint(os.getcwd())\n');
    expect(t.status).toBe('error');
    expect(t.error?.kind).toBe('ImportError');
    expect(t.error?.message).toContain("does not allow importing 'os'");
    expect(trace('import math, heapq\nfrom collections import deque\nx = math.sqrt(9)\n').status).toBe('completed');
  });

  it('serializes nested lists and objects reachable through other objects', () => {
    const t = normalize(
      trace(`class Node:
    def __init__(self, val, next=None):
        self.val = val
        self.next = next
grid = [[1, 2], [3, 4]]
head = Node(1, Node(2, Node(3)))
done = True
`)
    );
    const last = t.steps[t.steps.length - 1]!;
    const objects = Object.entries(last.heap).map(([id, v]) => t.heapVersions[id]![v]!);
    expect(objects.filter((o) => o.kind === 'instance')).toHaveLength(3);
    expect(objects.filter((o) => o.kind === 'list')).toHaveLength(3);
    const gridId = (new Map(last.frames[0]!.locals).get('grid') as { id: string }).id;
    expect(t.lensHints[gridId]).toBe('grid');
    const headId = (new Map(last.frames[0]!.locals).get('head') as { id: string }).id;
    expect(t.lensHints[headId]).toBe('linked_list');
  });

  it('handles cycles and caps very large structures', () => {
    const cyc = trace('a = [1]\na.append(a)\nb = {"self": None}\nb["self"] = b\nx = 0\n');
    expect(cyc.status).toBe('completed');
    const big = trace('rows = [[i] for i in range(1000)]\nx = 0\n');
    const heap = big.steps[big.steps.length - 1]!.heap;
    expect(Object.keys(heap).length).toBeLessThanOrEqual(300);
    const outer = Object.values(heap).find((o) => (o.items?.length ?? 0) > 50)!;
    expect(outer.items!.length).toBe(100);
  });

  it('lists frames outermost first and hides the tracer helpers', () => {
    const t = trace('def f(n):\n    return n * 2\nr = f(3)\n');
    const inF = t.steps.find((s) => s.frames.length === 2)!;
    expect(inF.frames.map((f) => f.name)).toEqual(['<module>', 'f']);
    expect(t.steps.every((s) => s.frames[0]!.locals.every(([n]) => n !== 'Stack' && n !== 'Queue'))).toBe(true);
  });
});

import { describe, it, expect } from 'vitest';
import { normalize, RawTrace } from '../../src/trace/normalize';
import { runClikeInterpreter } from '../../src/engine/adapters/clike/interpreter';
import { stateAt } from '../../src/trace/reconstruct';

describe('Section-14 Required Test Programs (Golden Suite)', () => {
  // Test 1: Python Variables
  it('Program 1: Variables (x = 10; y = 20; z = x + y)', () => {
    const rawTrace: RawTrace = {
      language: 'python',
      source: 'x = 10\ny = 20\nz = x + y',
      status: 'completed',
      stdout: '',
      steps: [
        {
          line: 1,
          kind: 'line',
          frames: [{ id: 'f0', name: '<module>', line: 1, locals: [['x', { k: 'int', v: '10' }]] }],
          heap: {},
        },
        {
          line: 2,
          kind: 'line',
          frames: [
            {
              id: 'f0',
              name: '<module>',
              line: 2,
              locals: [
                ['x', { k: 'int', v: '10' }],
                ['y', { k: 'int', v: '20' }],
              ],
            },
          ],
          heap: {},
        },
        {
          line: 3,
          kind: 'line',
          frames: [
            {
              id: 'f0',
              name: '<module>',
              line: 3,
              locals: [
                ['x', { k: 'int', v: '10' }],
                ['y', { k: 'int', v: '20' }],
                ['z', { k: 'int', v: '30' }],
              ],
            },
          ],
          heap: {},
        },
      ],
    };

    const trace = normalize(rawTrace);
    expect(trace.steps.length).toBe(3);
    const finalState = stateAt(trace, 2);
    const zVar = finalState.frames[0]?.locals.find(([k]) => k === 'z');
    expect(zVar?.[1]).toEqual({ k: 'int', v: '30' });
  });

  // Test 2: Python Conditionals
  it('Program 2: Conditionals (if taken branch)', () => {
    const rawTrace: RawTrace = {
      language: 'python',
      source: 'x = 10\nif x > 5:\n    x = 20\nelse:\n    x = 0',
      status: 'completed',
      stdout: '',
      steps: [
        {
          line: 1,
          kind: 'line',
          frames: [{ id: 'f0', name: '<module>', line: 1, locals: [['x', { k: 'int', v: '10' }]] }],
          heap: {},
        },
        {
          line: 2,
          kind: 'line',
          frames: [{ id: 'f0', name: '<module>', line: 2, locals: [['x', { k: 'int', v: '10' }]] }],
          heap: {},
          explicitEvents: [{ type: 'branch', line: 2, construct: 'if', taken: true }],
        },
        {
          line: 3,
          kind: 'line',
          frames: [{ id: 'f0', name: '<module>', line: 3, locals: [['x', { k: 'int', v: '20' }]] }],
          heap: {},
        },
      ],
    };

    const trace = normalize(rawTrace);
    const step1 = trace.steps[1]!;
    expect(step1.events.some((e) => e.type === 'branch' && e.taken === true)).toBe(true);
    const finalState = stateAt(trace, 2);
    expect(finalState.frames[0]?.locals.find(([k]) => k === 'x')?.[1]).toEqual({ k: 'int', v: '20' });
  });

  // Test 3: Python Loops & Iterations
  it('Program 3: Loops and loop_iter events', () => {
    const rawTrace: RawTrace = {
      language: 'python',
      source: 'total = 0\nfor i in range(5):\n    total += i',
      status: 'completed',
      stdout: '',
      steps: [
        {
          line: 1,
          kind: 'line',
          frames: [{ id: 'f0', name: '<module>', line: 1, locals: [['total', { k: 'int', v: '0' }]] }],
          heap: {},
        },
        {
          line: 2,
          kind: 'line',
          frames: [
            {
              id: 'f0',
              name: '<module>',
              line: 2,
              locals: [
                ['total', { k: 'int', v: '0' }],
                ['i', { k: 'int', v: '0' }],
              ],
            },
          ],
          heap: {},
          explicitEvents: [{ type: 'loop_iter', line: 2, iteration: 1 }],
        },
        {
          line: 2,
          kind: 'line',
          frames: [
            {
              id: 'f0',
              name: '<module>',
              line: 2,
              locals: [
                ['total', { k: 'int', v: '10' }],
                ['i', { k: 'int', v: '4' }],
              ],
            },
          ],
          heap: {},
          explicitEvents: [{ type: 'loop_iter', line: 2, iteration: 5 }],
        },
      ],
    };

    const trace = normalize(rawTrace);
    expect(trace.steps[1]?.events.some((e) => e.type === 'loop_iter')).toBe(true);
  });

  // Test 4: Array Mutation
  it('Program 4: Array in-place mutation and item_set events', () => {
    const rawTrace: RawTrace = {
      language: 'python',
      source: 'numbers = [10, 20, 30]\nnumbers[1] = 40',
      status: 'completed',
      stdout: '',
      steps: [
        {
          line: 1,
          kind: 'line',
          frames: [{ id: 'f0', name: '<module>', line: 1, locals: [['numbers', { k: 'ref', id: 'h1' }]] }],
          heap: {
            h1: {
              id: 'h1',
              kind: 'list',
              typeName: 'list',
              region: 'heap',
              items: [
                { k: 'int', v: '10' },
                { k: 'int', v: '20' },
                { k: 'int', v: '30' },
              ],
            },
          },
        },
        {
          line: 2,
          kind: 'line',
          frames: [{ id: 'f0', name: '<module>', line: 2, locals: [['numbers', { k: 'ref', id: 'h1' }]] }],
          heap: {
            h1: {
              id: 'h1',
              kind: 'list',
              typeName: 'list',
              region: 'heap',
              items: [
                { k: 'int', v: '10' },
                { k: 'int', v: '40' },
                { k: 'int', v: '30' },
              ],
            },
          },
        },
      ],
    };

    const trace = normalize(rawTrace);
    const step1 = trace.steps[1]!;
    expect(step1.events).toContainEqual({
      type: 'item_set',
      id: 'h1',
      index: 1,
      from: { k: 'int', v: '20' },
      to: { k: 'int', v: '40' },
    });
  });

  // Test 5: Function Call and Return
  it('Program 5: Functions with call and return frames', () => {
    const rawTrace: RawTrace = {
      language: 'python',
      source: 'def add(a, b):\n    return a + b\nresult = add(10, 20)',
      status: 'completed',
      stdout: '',
      steps: [
        {
          line: 3,
          kind: 'call',
          frames: [
            {
              id: 'f1',
              name: 'add',
              line: 1,
              locals: [
                ['a', { k: 'int', v: '10' }],
                ['b', { k: 'int', v: '20' }],
              ],
            },
            { id: 'f0', name: '<module>', line: 3, locals: [] },
          ],
          heap: {},
        },
        {
          line: 2,
          kind: 'return',
          frames: [
            {
              id: 'f1',
              name: 'add',
              line: 2,
              locals: [
                ['a', { k: 'int', v: '10' }],
                ['b', { k: 'int', v: '20' }],
              ],
              returnValue: { k: 'int', v: '30' },
            },
            { id: 'f0', name: '<module>', line: 3, locals: [] },
          ],
          heap: {},
        },
        {
          line: 3,
          kind: 'line',
          frames: [{ id: 'f0', name: '<module>', line: 3, locals: [['result', { k: 'int', v: '30' }]] }],
          heap: {},
        },
      ],
    };

    const trace = normalize(rawTrace);
    expect(trace.steps.length).toBe(3);
    expect(trace.steps[0]?.kind).toBe('call');
    expect(trace.steps[1]?.kind).toBe('return');
  });

  // Test 9 & 10: C Pointer Swap and Errors
  it('Program 9 & 10: C pointer swap and validation', () => {
    const cSwap = `#include <stdio.h>
void swap(int *a, int *b) {
    int t = *a;
    *a = *b;
    *b = t;
}
int main() {
    int x = 3, y = 7;
    swap(&x, &y);
    printf("%d %d\\n", x, y);
    return 0;
}
`;
    const trace = runClikeInterpreter(cSwap);
    expect(trace.status).toBe('completed');
    expect(trace.stdout).toBe('7 3\n');
  });
});


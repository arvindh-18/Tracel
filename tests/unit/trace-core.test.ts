import { describe, it, expect } from 'vitest';
import { diffFrames, diffHeapObject } from '../../src/trace/diff';
import { normalize, RawTrace } from '../../src/trace/normalize';
import { stateAt } from '../../src/trace/reconstruct';
import { narrate } from '../../src/trace/narrate';
import { Frame, HeapObject, Step, Value } from '../../src/trace/schema';

describe('Trace Core & Diff Engine', () => {
  it('detects variable creations, updates, and deletions correctly', () => {
    const prevFrames: Frame[] = [
      {
        id: 'f0',
        name: '<module>',
        line: 1,
        locals: [
          ['x', { k: 'int', v: '10' }],
          ['y', { k: 'int', v: '20' }],
        ],
      },
    ];

    const nextFrames: Frame[] = [
      {
        id: 'f0',
        name: '<module>',
        line: 2,
        locals: [
          ['x', { k: 'int', v: '15' }],
          ['z', { k: 'int', v: '30' }],
        ],
      },
    ];

    const events = diffFrames(prevFrames, nextFrames);
    expect(events).toEqual([
      {
        type: 'var_update',
        frame: 'f0',
        name: 'x',
        from: { k: 'int', v: '10' },
        to: { k: 'int', v: '15' },
      },
      {
        type: 'var_create',
        frame: 'f0',
        name: 'z',
        value: { k: 'int', v: '30' },
      },
      {
        type: 'var_delete',
        frame: 'f0',
        name: 'y',
      },
    ]);
  });

  it('detects sequence item_set and item_swap', () => {
    const prevObj: HeapObject = {
      id: 'h1',
      kind: 'array',
      typeName: 'list',
      region: 'heap',
      version: 0,
      items: [
        { k: 'int', v: '10' },
        { k: 'int', v: '20' },
        { k: 'int', v: '30' },
      ],
    };

    const nextSetObj: HeapObject = {
      ...prevObj,
      version: 1,
      items: [
        { k: 'int', v: '10' },
        { k: 'int', v: '99' },
        { k: 'int', v: '30' },
      ],
    };

    const setEvents = diffHeapObject(prevObj, nextSetObj);
    expect(setEvents).toEqual([
      {
        type: 'item_set',
        id: 'h1',
        index: 1,
        from: { k: 'int', v: '20' },
        to: { k: 'int', v: '99' },
      },
    ]);

    // Swap test
    const nextSwapObj: HeapObject = {
      ...prevObj,
      version: 1,
      items: [
        { k: 'int', v: '30' },
        { k: 'int', v: '20' },
        { k: 'int', v: '10' },
      ],
    };

    const swapEvents = diffHeapObject(prevObj, nextSwapObj);
    expect(swapEvents).toEqual([
      {
        type: 'item_swap',
        id: 'h1',
        i: 0,
        j: 2,
      },
    ]);
  });

  it('normalizes raw steps and allows exact stateAt reconstruction forward and backward', () => {
    const rawTrace: RawTrace = {
      language: 'python',
      source: 'x = 10\ny = 20\nx = x + y',
      status: 'completed',
      stdout: 'done\n',
      steps: [
        {
          line: 1,
          kind: 'line',
          frames: [
            {
              id: 'f0',
              name: '<module>',
              line: 1,
              locals: [['x', { k: 'int', v: '10' }]],
            },
          ],
          heap: {},
          stdoutLength: 0,
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
          stdoutLength: 0,
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
                ['x', { k: 'int', v: '30' }],
                ['y', { k: 'int', v: '20' }],
              ],
            },
          ],
          heap: {},
          stdoutLength: 5,
        },
      ],
    };

    const trace = normalize(rawTrace);
    expect(trace.steps.length).toBe(3);

    // Forward check
    const state0 = stateAt(trace, 0);
    expect(state0.frames[0]?.locals).toEqual([['x', { k: 'int', v: '10' }]]);
    expect(state0.output).toBe('');

    const state2 = stateAt(trace, 2);
    expect(state2.frames[0]?.locals).toEqual([
      ['x', { k: 'int', v: '30' }],
      ['y', { k: 'int', v: '20' }],
    ]);
    expect(state2.output).toBe('done\n');

    // Backward check: stateAt step 1 reproduces step 1 exact state
    const state1 = stateAt(trace, 1);
    expect(state1.frames[0]?.locals).toEqual([
      ['x', { k: 'int', v: '10' }],
      ['y', { k: 'int', v: '20' }],
    ]);
  });
});


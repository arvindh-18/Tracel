// Hand-written Gemini responses (the "simulate" schema) for offline tests.
import { SimulateResult } from '../../src/engine/adapters/ai/schema';

const int = (v: number) => ({ k: 'int' as const, v: String(v) });
const ptr = (id: string | undefined, t = 'int', offset?: number) => ({ k: 'ptr' as const, t, ...(id ? { id } : {}), ...(offset !== undefined ? { offset } : {}) });
const ref = (id: string) => ({ k: 'ref' as const, id });

export const SWAP_SOURCE = `#include <stdio.h>
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

export const SWAP: SimulateResult = {
  steps: [
    { line: 7, ops: [{ op: 'call', fn: 'main', args: [] }] },
    { line: 8, ops: [{ op: 'declare', name: 'x', type: 'int', value: int(3) }, { op: 'declare', name: 'y', type: 'int', value: int(7) }] },
    { line: 9, narration: 'call swap', ops: [{ op: 'call', fn: 'swap', args: [{ name: 'a', value: ptr('&x') }, { name: 'b', value: ptr('&y') }] }] },
    { line: 3, ops: [{ op: 'declare', name: 't', type: 'int', value: int(3) }] },
    { line: 4, ops: [{ op: 'write', id: '&x', value: int(7) }] },
    { line: 5, ops: [{ op: 'write', id: '&y', value: int(3) }] },
    { line: 6, ops: [{ op: 'return' }] },
    { line: 10, ops: [{ op: 'print', text: '7 3\n' }] },
    { line: 11, ops: [{ op: 'return', value: int(0) }] },
  ],
};

export const ARRAY_SUM_SOURCE = `int main() {
    int arr[3] = {10, 20, 30};
    int sum = 0;
    for (int i = 0; i < 3; i++)
        sum += arr[i];
    return 0;
}
`;

function arraySum(): SimulateResult {
  const steps: SimulateResult['steps'] = [
    { line: 1, ops: [{ op: 'call', fn: 'main', args: [] }] },
    { line: 2, ops: [{ op: 'alloc', id: 'h1', kind: 'array', region: 'stack', type: 'int', count: 3, init: [int(10), int(20), int(30)] }, { op: 'declare', name: 'arr', type: 'int[3]', value: ref('h1') }] },
    { line: 3, ops: [{ op: 'declare', name: 'sum', type: 'int', value: int(0) }] },
    { line: 4, ops: [{ op: 'declare', name: 'i', type: 'int', value: int(0) }] },
  ];
  let sum = 0;
  for (let i = 0; i < 3; i++) {
    sum += (i + 1) * 10;
    steps.push({ line: 5, ops: [{ op: 'assign', name: 'sum', value: int(sum) }] });
    steps.push({ line: 4, ops: [{ op: 'assign', name: 'i', value: int(i + 1) }] });
  }
  steps.push({ line: 6, ops: [{ op: 'return', value: int(0) }] });
  return { steps };
}
export const ARRAY_SUM = arraySum();

export const LINKED_LIST_SOURCE = `#include <stdlib.h>
struct Node { int val; struct Node *next; };
int main() {
    struct Node *b = malloc(sizeof(struct Node));
    b->val = 2; b->next = NULL;
    struct Node *a = malloc(sizeof(struct Node));
    a->val = 1; a->next = b;
    free(a);
    free(b);
    return 0;
}
`;

export const LINKED_LIST: SimulateResult = {
  steps: [
    { line: 3, ops: [{ op: 'call', fn: 'main', args: [] }] },
    { line: 4, ops: [{ op: 'alloc', id: 'h1', kind: 'struct', region: 'heap', type: 'Node', fields: [{ name: 'val', value: { k: 'uninit', t: 'int' } }, { name: 'next', value: { k: 'uninit', t: 'Node*' } }] }, { op: 'declare', name: 'b', type: 'Node*', value: ptr('h1', 'Node') }] },
    { line: 5, ops: [{ op: 'write', id: 'h1', field: 'val', value: int(2) }, { op: 'write', id: 'h1', field: 'next', value: ptr(undefined, 'Node') }] },
    { line: 6, ops: [{ op: 'alloc', id: 'h2', kind: 'struct', region: 'heap', type: 'Node', fields: [{ name: 'val', value: { k: 'uninit', t: 'int' } }, { name: 'next', value: { k: 'uninit', t: 'Node*' } }] }, { op: 'declare', name: 'a', type: 'Node*', value: ptr('h2', 'Node') }] },
    { line: 7, ops: [{ op: 'write', id: 'h2', field: 'val', value: int(1) }, { op: 'write', id: 'h2', field: 'next', value: ptr('h1', 'Node') }] },
    { line: 8, ops: [{ op: 'free', id: 'h2' }] },
    { line: 9, ops: [{ op: 'free', id: 'h1' }] },
    { line: 10, ops: [{ op: 'return', value: int(0) }] },
  ],
  lensHints: [{ name: 'a', lens: 'linked_list' }],
};

export const CONTAINERS_SOURCE = `#include <vector>
#include <stack>
#include <queue>
using namespace std;
int main() {
    vector<int> v;
    v.push_back(5);
    stack<int> s;
    s.push(1);
    s.push(2);
    s.pop();
    queue<int> q;
    q.push(8);
    q.push(9);
    q.pop();
    return 0;
}
`;

export const CONTAINERS: SimulateResult = {
  steps: [
    { line: 5, ops: [{ op: 'call', fn: 'main', args: [] }] },
    { line: 6, ops: [{ op: 'alloc', id: 'h1', kind: 'vector', region: 'heap', type: 'int' }, { op: 'declare', name: 'v', type: 'vector<int>', value: ref('h1') }] },
    { line: 7, ops: [{ op: 'push_back', id: 'h1', value: int(5) }] },
    { line: 8, ops: [{ op: 'alloc', id: 'h2', kind: 'stack', region: 'heap', type: 'int' }, { op: 'declare', name: 's', type: 'stack<int>', value: ref('h2') }] },
    { line: 9, ops: [{ op: 'push', id: 'h2', value: int(1) }] },
    { line: 10, ops: [{ op: 'push', id: 'h2', value: int(2) }] },
    { line: 11, ops: [{ op: 'pop', id: 'h2' }] },
    { line: 12, ops: [{ op: 'alloc', id: 'h3', kind: 'queue', region: 'heap', type: 'int' }, { op: 'declare', name: 'q', type: 'queue<int>', value: ref('h3') }] },
    { line: 13, ops: [{ op: 'enqueue', id: 'h3', value: int(8) }] },
    { line: 14, ops: [{ op: 'enqueue', id: 'h3', value: int(9) }] },
    { line: 15, ops: [{ op: 'dequeue', id: 'h3' }] },
    { line: 16, ops: [{ op: 'return', value: int(0) }] },
  ],
};

export const OOB_SOURCE = `int main() {
    int arr[2] = {1, 2};
    arr[2] = 9;
    return 0;
}
`;

/** The model forgot to flag the bug; the replayer's bounds check catches it. */
export const OOB_UNFLAGGED: SimulateResult = {
  steps: [
    { line: 1, ops: [{ op: 'call', fn: 'main', args: [] }] },
    { line: 2, ops: [{ op: 'alloc', id: 'h1', kind: 'array', region: 'stack', type: 'int', count: 2, init: [int(1), int(2)] }, { op: 'declare', name: 'arr', type: 'int[2]', value: ref('h1') }] },
    { line: 3, ops: [{ op: 'write', id: 'h1', index: 2, value: int(9) }] },
    { line: 4, ops: [{ op: 'return', value: int(0) }] },
  ],
};

export const OOB_FLAGGED: SimulateResult = {
  steps: [
    ...OOB_UNFLAGGED.steps.slice(0, 2),
    { line: 3, ops: [{ op: 'error', kind: 'OutOfBounds', message: 'arr has 2 elements; index 2 is past the end.' }] },
  ],
};

export const USE_AFTER_FREE: SimulateResult = {
  steps: [
    { line: 3, ops: [{ op: 'call', fn: 'main', args: [] }] },
    { line: 4, ops: [{ op: 'alloc', id: 'h1', kind: 'struct', region: 'heap', type: 'Node', fields: [{ name: 'val', value: int(0) }, { name: 'next', value: ptr(undefined, 'Node') }] }, { op: 'declare', name: 'b', type: 'Node*', value: ptr('h1', 'Node') }] },
    { line: 8, ops: [{ op: 'free', id: 'h1' }] },
    { line: 9, ops: [{ op: 'write', id: 'h1', field: 'val', value: int(5) }] },
  ],
};

export const INVALID_OP: SimulateResult = {
  steps: [
    { line: 1, ops: [{ op: 'call', fn: 'main', args: [] }] },
    { line: 2, ops: [{ op: 'write', id: 'h9', index: 0, value: int(1) }] },
  ],
};

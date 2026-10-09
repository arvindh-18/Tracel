import { describe, expect, it } from 'vitest';
import { runClikeInterpreter } from '../../src/engine/adapters/clike/interpreter';
import { normalize } from '../../src/trace/normalize';
import { clearStateCache, stateAt } from '../../src/trace/reconstruct';
import { HeapObject, Trace, Value } from '../../src/trace/schema';

const run = (code: string, stdin?: string) => normalize(runClikeInterpreter(code, { stdin }));
const lastLocals = (t: Trace, at = t.steps.length - 1) => {
  const frames = t.steps[at]!.frames;
  return new Map(frames[frames.length - 1]!.locals);
};
const heapAt = (t: Trace, at = t.steps.length - 1): HeapObject[] =>
  Object.entries(t.steps[at]!.heap).map(([id, v]) => t.heapVersions[id]![v]!);
const ints = (items: Value[] | undefined) => (items ?? []).map((v) => (v.k === 'int' ? Number(v.v) : NaN));
/** The step just before main returns: every local is still in scope. */
const beforeReturn = (t: Trace) => t.steps.length - 1;

function expectError(code: string, kind: string, line: number, stdin?: string) {
  const t = run(code, stdin);
  expect(t.status, `${kind}: ${t.error?.message}`).toBe('error');
  expect(t.error?.kind).toBe(kind);
  expect(t.error?.line).toBe(line);
  expect(t.error?.title).toBeTruthy();
  expect(t.error?.explanation).toBeTruthy();
  expect(t.steps[t.steps.length - 1]!.kind).toBe('exception');
  return t;
}

describe('C/C++ golden programs', () => {
  it('pointer swap prints 7 3', () => {
    const t = run(`#include <stdio.h>
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
`);
    expect(t.stdout).toBe('7 3\n');
    const inSwap = t.steps.find((s) => s.frames.length === 2 && s.line === 5)!;
    const a = new Map(inSwap.frames[1]!.locals).get('a')!;
    expect(a).toMatchObject({ k: 'ptr', id: 'x', offset: 0, t: 'int' });
  });

  it('array sum loop computes the sum', () => {
    const t = run(`#include <stdio.h>
int main() {
    int arr[5] = {10, 20, 30, 40, 50};
    int sum = 0;
    for (int i = 0; i < 5; i++) sum += arr[i];
    printf("%d\\n", sum);
    return 0;
}
`);
    expect(t.stdout).toBe('150\n');
    expect(lastLocals(t).get('sum')).toEqual({ k: 'int', v: '150' });
    expect(t.steps.filter((s) => s.events.some((e) => e.type === 'loop_iter')).length).toBe(5);
  });

  it('bubble sort sorts in place', () => {
    const t = run(`int main() {
    int a[6] = {5, 2, 9, 1, 7, 3};
    int n = 6;
    for (int i = 0; i < n - 1; i++)
        for (int j = 0; j < n - 1 - i; j++)
            if (a[j] > a[j + 1]) {
                int tmp = a[j];
                a[j] = a[j + 1];
                a[j + 1] = tmp;
            }
    return 0;
}
`);
    expect(ints(heapAt(t).find((o) => o.kind === 'array')!.items)).toEqual([1, 2, 3, 5, 7, 9]);
  });

  it('recursion: factorial and fibonacci', () => {
    const t = run(`#include <stdio.h>
int fact(int n) { return n <= 1 ? 1 : n * fact(n - 1); }
int fib(int n) {
    if (n < 2) return n;
    return fib(n - 1) + fib(n - 2);
}
int main() {
    printf("%d %d\\n", fact(6), fib(10));
    return 0;
}
`);
    expect(t.stdout).toBe('720 55\n');
    expect(t.stats.maxDepth).toBe(11); // main + fib(10) .. fib(1)
  });

  it('2-D arrays with initializer lists', () => {
    const t = run(`#include <stdio.h>
int main() {
    int g[2][3] = {{1, 2, 3}, {4, 5, 6}};
    int total = 0;
    for (int r = 0; r < 2; r++)
        for (int c = 0; c < 3; c++)
            total += g[r][c] * (r + 1);
    g[1][2] = 60;
    printf("%d %d\\n", total, g[1][2]);
    return 0;
}
`);
    expect(t.stdout).toBe('36 60\n');
    const outer = heapAt(t).find((o) => o.typeName === 'int[2][3]')!;
    expect(outer.items!.every((v) => v.k === 'inline')).toBe(true);
    expect(t.lensHints[outer.id]).toBe('grid');
  });

  it('struct with -> through a pointer', () => {
    const t = run(`#include <stdio.h>
struct Point { int x; int y; };
void move(struct Point *p) { p->x += 10; p->y = p->x * 2; }
int main() {
    struct Point pt = {1, 2};
    move(&pt);
    printf("%d %d\\n", pt.x, pt.y);
    return 0;
}
`);
    expect(t.stdout).toBe('11 22\n');
    const pt = heapAt(t).find((o) => o.kind === 'struct')!;
    expect(pt.region).toBe('stack');
    expect(lastLocals(t).get('pt')).toEqual({ k: 'inline', id: pt.id });
  });

  it('malloc linked list: build, traverse and free', () => {
    const t = run(`#include <stdio.h>
#include <stdlib.h>
typedef struct Node { int val; struct Node *next; } Node;
int main() {
    Node *head = NULL;
    for (int i = 1; i <= 3; i++) {
        Node *n = (Node *)malloc(sizeof(Node));
        n->val = i * 10;
        n->next = head;
        head = n;
    }
    int sum = 0;
    for (Node *cur = head; cur != NULL; cur = cur->next) sum += cur->val;
    printf("%d\\n", sum);
    while (head != NULL) {
        Node *next = head->next;
        free(head);
        head = next;
    }
    return 0;
}
`);
    expect(t.status).toBe('completed');
    expect(t.stdout).toBe('60\n');
    const nodes = heapAt(t).filter((o) => o.kind === 'struct');
    expect(nodes).toHaveLength(3);
    expect(nodes.every((n) => n.freed && n.region === 'heap')).toBe(true);
    expect(nodes.every((n) => t.lensHints[n.id] === 'linked_list')).toBe(true);
  });

  it('new/delete binary search tree with a class', () => {
    const t = run(`#include <iostream>
using namespace std;
class Node {
public:
    int key;
    Node *left, *right;
    Node(int k) : key(k), left(nullptr), right(nullptr) {}
};
Node* insert(Node* root, int k) {
    if (root == nullptr) return new Node(k);
    if (k < root->key) root->left = insert(root->left, k);
    else root->right = insert(root->right, k);
    return root;
}
void inorder(Node* r) {
    if (!r) return;
    inorder(r->left);
    cout << r->key << " ";
    inorder(r->right);
}
void destroy(Node* r) {
    if (!r) return;
    destroy(r->left);
    destroy(r->right);
    delete r;
}
int main() {
    Node* root = nullptr;
    int keys[5] = {50, 30, 70, 20, 40};
    for (int i = 0; i < 5; i++) root = insert(root, keys[i]);
    inorder(root);
    cout << endl;
    destroy(root);
    return 0;
}
`);
    expect(t.status).toBe('completed');
    expect(t.stdout).toBe('20 30 40 50 70 \n');
    const nodes = heapAt(t).filter((o) => o.kind === 'struct');
    expect(nodes).toHaveLength(5);
    expect(nodes.every((n) => n.freed)).toBe(true);
    expect(t.lensHints[nodes[0]!.id]).toBe('tree');
  });

  it('class with member functions, constructor, this and destructor', () => {
    const t = run(`#include <iostream>
using namespace std;
class Counter {
    int count;
public:
    Counter(int start) { this->count = start; }
    void add(int n) { count += n; }
    int get() const { return count; }
    ~Counter() { cout << "bye " << count << endl; }
};
int main() {
    Counter c(5);
    c.add(3);
    Counter* p = new Counter(1);
    p->add(c.get());
    cout << p->get() << endl;
    delete p;
    return 0;
}
`);
    expect(t.stdout).toBe('9\nbye 9\n');
    expect(t.steps.some((s) => s.frames.some((f) => f.name === 'Counter::add'))).toBe(true);
    const inAdd = t.steps.find((s) => s.frames[s.frames.length - 1]!.name === 'Counter::add')!;
    expect(new Map(inAdd.frames[inAdd.frames.length - 1]!.locals).get('this')).toMatchObject({ k: 'ptr' });
  });

  it('vector push_back and range-for', () => {
    const t = run(`#include <iostream>
#include <vector>
using namespace std;
int main() {
    vector<int> v;
    for (int i = 1; i <= 4; i++) v.push_back(i * i);
    int sum = 0;
    for (int x : v) sum += x;
    cout << sum << " " << v.size() << " " << v.back() << endl;
    v.pop_back();
    return 0;
}
`);
    expect(t.stdout).toBe('30 4 16\n');
    expect(ints(heapAt(t).find((o) => o.kind === 'vector')!.items)).toEqual([1, 4, 9]);
  });

  it('std::stack and std::queue', () => {
    const t = run(`#include <iostream>
#include <stack>
#include <queue>
using namespace std;
int main() {
    stack<int> s;
    queue<int> q;
    for (int i = 1; i <= 3; i++) { s.push(i); q.push(i * 10); }
    cout << s.top() << " " << q.front() << " " << q.back() << endl;
    s.pop();
    q.pop();
    cout << s.size() << " " << q.front() << " " << s.empty() << endl;
    return 0;
}
`);
    expect(t.stdout).toBe('3 10 30\n2 20 0\n');
    const kinds = heapAt(t).map((o) => o.kind).sort();
    expect(kinds).toEqual(['cpp_queue', 'cpp_stack']);
  });

  it('printf formatting', () => {
    const t = run(`#include <stdio.h>
int main() {
    int n = 42;
    double d = 3.14159;
    char c = 'Z';
    long long big = 9000000000LL;
    printf("[%d|%5d|%-5d|%05d]\\n", n, n, n, n);
    printf("[%.2f|%8.3f|%f]\\n", d, d, d);
    printf("[%c|%s|%x|%X|%u|%%]\\n", c, "hi", 255, 255, 7);
    printf("[%lld|%ld|%i]\\n", big, 5L, -3);
    puts("done");
    putchar('!');
    return 0;
}
`);
    expect(t.stdout).toBe('[42|   42|42   |00042]\n[3.14|   3.142|3.141590]\n[Z|hi|ff|FF|7|%]\n[9000000000|5|-3]\ndone\n!');
  });

  it('scanf and cin read from the Input box', () => {
    const c = run(
      `#include <stdio.h>
int main() {
    int a, b;
    scanf("%d %d", &a, &b);
    printf("%d\\n", a * b);
    return 0;
}
`,
      '6 7'
    );
    expect(c.stdout).toBe('42\n');
    const cpp = run(
      `#include <iostream>
#include <string>
using namespace std;
int main() {
    string name;
    int age;
    cin >> name >> age;
    cout << name << " is " << age + 1 << endl;
    return 0;
}
`,
      'Ada 36'
    );
    expect(cpp.stdout).toBe('Ada is 37\n');
  });

  it('int overflow wraps around; long long does not', () => {
    const t = run(`#include <stdio.h>
int main() {
    int big = 2147483647;
    big = big + 1;
    int m = 65536 * 65536;
    long long wide = 2147483647;
    wide = wide + 1;
    unsigned int u = 0;
    u = u - 1;
    printf("%d %d %lld %u %d\\n", big, m, wide, u, 7 / -2);
    return 0;
}
`);
    expect(t.stdout).toBe('-2147483648 0 2147483648 4294967295 -3\n');
  });

  it('out-of-bounds write stops on its line', () => {
    const t = expectError(
      `int main() {
    int arr[5] = {1, 2, 3, 4, 5};
    int i = 5;
    arr[i] = 99;
    return 0;
}
`,
      'OutOfBounds',
      4
    );
    expect(t.error!.context).toEqual([{ name: 'i', value: { k: 'int', v: '5' } }]);
  });

  it('null dereference', () => {
    expectError(
      `#include <stdlib.h>
struct Node { int val; struct Node *next; };
int main() {
    struct Node *p = NULL;
    p->val = 3;
    return 0;
}
`,
      'NullDereference',
      5
    );
  });

  it('use after free', () => {
    expectError(
      `#include <stdlib.h>
int main() {
    int *p = malloc(sizeof(int) * 3);
    p[0] = 1;
    free(p);
    p[1] = 2;
    return 0;
}
`,
      'UseAfterFree',
      6
    );
  });

  it('double free', () => {
    expectError('int main() {\n    int *p = new int(4);\n    delete p;\n    delete p;\n    return 0;\n}\n', 'DoubleFree', 4);
  });

  it('uninitialized read', () => {
    expectError('#include <stdio.h>\nint main() {\n    int total;\n    total += 5;\n    return 0;\n}\n', 'UninitializedRead', 4);
  });

  it('division by zero', () => {
    expectError('int main() {\n    int a = 10, b = 0;\n    int c = a % b;\n    return 0;\n}\n', 'DivisionByZero', 3);
  });

  it('rejects unsupported features before running', () => {
    const cases: [string, number, RegExp][] = [
      ['template <typename T>\nT id(T x) { return x; }\nint main() { return 0; }\n', 1, /templates/],
      ['int main() {\n    goto end;\n    end: return 0;\n}\n', 2, /goto/],
      ['union U { int a; float b; };\nint main() { return 0; }\n', 1, /unions/],
      ['struct F { int a : 3; };\nint main() { return 0; }\n', 1, /bit-fields/],
      ['class A {};\nclass B : public A {};\nint main() { return 0; }\n', 2, /inheritance/],
      ['class A {\n    virtual void f() {}\n};\nint main() { return 0; }\n', 2, /virtual/],
      ['#include "helpers.h"\nint main() { return 0; }\n', 1, /single file/],
      ['#include <regex>\nint main() { return 0; }\n', 1, /doesn't provide <regex>/],
      ['int main() {\n    asm("nop");\n    return 0;\n}\n', 2, /assembly/],
    ];
    for (const [code, line, message] of cases) {
      const t = runClikeInterpreter(code);
      expect(t.status, code).toBe('error');
      expect(t.error?.phase, code).toBe('unsupported');
      expect(t.error?.line, code).toBe(line);
      expect(t.error?.message, code).toMatch(message);
      expect(t.steps).toHaveLength(0);
    }
  });
});

describe('C/C++ trace shape', () => {
  const program = `#include <stdlib.h>
int sum(int *a, int n) {
    int s = 0;
    for (int i = 0; i < n; i++) s += a[i];
    return s;
}
int main() {
    int arr[4] = {1, 2, 3, 4};
    int *p = arr + 2;
    int *heap = malloc(2 * sizeof(int));
    heap[0] = 5;
    heap[1] = 6;
    int total = sum(arr, 4);
    free(heap);
    return 0;
}
`;

  it('pointers reference the right block and offset', () => {
    const t = run(program);
    const locals = lastLocals(t, beforeReturn(t));
    const arr = locals.get('arr') as { k: 'inline'; id: string };
    expect(locals.get('p')).toMatchObject({ k: 'ptr', id: arr.id, offset: 2, t: 'int' });
    const heapPtr = locals.get('heap') as { k: 'ptr'; id: string };
    const block = heapAt(t).find((o) => o.id === heapPtr.id)!;
    expect(block.region).toBe('heap');
    expect(block.freed).toBe(true);
    expect(block.address).toMatch(/^0x[0-9a-f]{8}$/);
  });

  it('frames push and pop with locals in declaration order', () => {
    const t = run(program);
    const depths = t.steps.map((s) => s.frames.length);
    expect(Math.max(...depths)).toBe(2);
    const inSum = t.steps.find((s) => s.frames.length === 2 && new Map(s.frames[1]!.locals).has('s'))!;
    expect(inSum.frames.map((f) => f.name)).toEqual(['main', 'sum']);
    expect(inSum.frames[1]!.locals.map(([n]) => n)).toEqual(['a', 'n', 's']);
    const ret = t.steps.find((s) => s.kind === 'return' && s.frames.length === 2)!;
    expect(ret.frames[1]!.returnValue).toEqual({ k: 'int', v: '10' });
    expect(t.steps.some((s) => s.events.some((e) => e.type === 'return'))).toBe(true);
    // Statements carry their source range.
    const decl = t.steps.find((s) => s.line === 8)!;
    expect(program.slice(decl.range!.from, decl.range!.to)).toBe('int arr[4] = {1, 2, 3, 4};');
  });

  it('stateAt gives identical states stepping forward and back', () => {
    const t = run(program);
    clearStateCache();
    const forward = t.steps.map((_, i) => JSON.stringify(stateAt(t, i)));
    clearStateCache();
    const backward = t.steps.map((_, i) => t.steps.length - 1 - i).map((i) => JSON.stringify(stateAt(t, i))).reverse();
    expect(backward).toEqual(forward);
  });
});

import { describe, it, expect } from 'vitest';
import { runClikeInterpreter } from '../../src/engine/adapters/clike/interpreter';
import { normalize } from '../../src/trace/normalize';
import { Trace } from '../../src/trace/schema';

describe('C/C++ Interpreter & Memory Model', () => {
  it('executes C pointer swap correctly', () => {
    const code = `#include <stdio.h>
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
    const trace = runClikeInterpreter(code);
    expect(trace.status).toBe('completed');
    expect(trace.steps.length).toBeGreaterThan(0);
    expect(trace.stdout).toBe('7 3\n');
  });

  it('rejects user-defined templates upfront with line-anchored explanation', () => {
    const code = `template<typename T>
T add(T a, T b) {
    return a + b;
}
int main() {
    return 0;
}
`;
    const trace = runClikeInterpreter(code);
    expect(trace.status).toBe('error');
    expect(trace.error?.phase).toBe('unsupported');
    expect(trace.error?.kind).toBe('UnsupportedFeature');
    expect(trace.error?.line).toBe(1);
    expect(trace.error?.message).toContain('templates');
  });

  it('handles array sum loops', () => {
    const code = `#include <stdio.h>
int main() {
    int arr[5] = {10, 20, 30, 40, 50};
    int sum = 0;
    for (int i = 0; i < 5; i++) sum += arr[i];
    printf("Sum: %d\\n", sum);
    return 0;
}
`;
    const trace = runClikeInterpreter(code);
    expect(trace.status).toBe('completed');
    expect(trace.stdout).toContain('Sum: 150');
  });

  const run = (code: string, stdin?: string) => normalize(runClikeInterpreter(code, { stdin }));
  const last = (t: Trace) => t.steps[t.steps.length - 1]!;
  const local = (t: Trace, name: string, at = t.steps.length - 1) => {
    const frames = t.steps[at]!.frames;
    return new Map(frames[frames.length - 1]!.locals).get(name);
  };
  const heapAt = (t: Trace, at: number) =>
    Object.entries(t.steps[at]!.heap).map(([id, v]) => t.heapVersions[id]![v]!);

  it('runs loops, arithmetic and array updates and records each variable change', () => {
    const t = run(`int main() {
    int arr[5] = {5, 1, 4, 2, 3};
    for (int i = 0; i < 4; i++) {
        for (int j = 0; j < 4 - i; j++) {
            if (arr[j] > arr[j + 1]) {
                int tmp = arr[j];
                arr[j] = arr[j + 1];
                arr[j + 1] = tmp;
            }
        }
    }
    return 0;
}
`);
    expect(t.status).toBe('completed');
    const arr = heapAt(t, t.steps.length - 1).find((o) => o.kind === 'array')!;
    expect(arr.items!.map((v) => (v as { v: string }).v)).toEqual(['1', '2', '3', '4', '5']);
    expect(t.steps.some((s) => s.events.some((e) => e.type === 'item_set'))).toBe(true);
    expect(t.steps.some((s) => s.events.some((e) => e.type === 'var_update' && e.name === 'i'))).toBe(true);
  });

  it('calls functions with their own frames, including recursion', () => {
    const t = run(`#include <stdio.h>
int fact(int n) {
    if (n <= 1) return 1;
    return n * fact(n - 1);
}
int main() {
    int r = fact(5);
    printf("%d\\n", r);
    return 0;
}
`);
    expect(t.stdout).toBe('120\n');
    expect(t.stats.maxDepth).toBe(6);
    const deepest = t.steps.find((s) => s.frames.length === 6)!;
    expect(deepest.frames.map((f) => f.name)).toEqual(['main', 'fact', 'fact', 'fact', 'fact', 'fact']);
    expect(t.steps.some((s) => s.kind === 'return' && s.frames[s.frames.length - 1]!.returnValue)).toBe(true);
    expect(t.steps.filter((s) => s.events.some((e) => e.type === 'return')).length).toBe(5);
  });

  it('models vector, stack and queue operations as container events', () => {
    const t = run(`#include <iostream>
#include <vector>
#include <stack>
#include <queue>
using namespace std;
int main() {
    vector<int> v;
    v.push_back(3);
    v.push_back(4);
    stack<int> s;
    s.push(1);
    s.push(2);
    cout << s.top() << endl;
    s.pop();
    queue<int> q;
    q.push(7);
    q.push(8);
    q.pop();
    cout << q.front() << " " << v.size() << endl;
    return 0;
}
`);
    expect(t.status).toBe('completed');
    expect(t.stdout).toBe('2\n8 2\n');
    const ops = t.steps.flatMap((s) => s.events.flatMap((e) => ('op' in e && e.op ? [e.op] : [])));
    expect(ops).toEqual(['append', 'append', 'push', 'push', 'pop', 'enqueue', 'enqueue', 'dequeue']);
    expect(Object.values(t.lensHints)).toEqual(expect.arrayContaining(['stack', 'queue']));
  });

  it('builds linked lists with new and follows pointers', () => {
    const t = run(`#include <iostream>
using namespace std;
struct Node {
    int val;
    Node* next;
};
int main() {
    Node* head = nullptr;
    for (int i = 3; i >= 1; i--) {
        Node* n = new Node{i, head};
        head = n;
    }
    int sum = 0;
    for (Node* cur = head; cur != nullptr; cur = cur->next) sum += cur->val;
    cout << sum << endl;
    return 0;
}
`);
    expect(t.stdout).toBe('6\n');
    const nodes = heapAt(t, t.steps.length - 1).filter((o) => o.kind === 'struct');
    expect(nodes).toHaveLength(3);
    const headPtr = local(t, 'head')!;
    expect(headPtr.k).toBe('ptr');
    expect(t.lensHints[(headPtr as { id: string }).id]).toBe('linked_list');
  });

  it('supports references, pointers to locals, strings and stdin', () => {
    const t = run(
      `#include <iostream>
#include <string>
using namespace std;
void addTo(int &total, int x) { total += x; }
int main() {
    int total = 0;
    int n;
    cin >> n;
    int *p = &total;
    for (int i = 1; i <= n; i++) addTo(total, i);
    *p = *p * 2;
    string name = "sum";
    cout << name + "=" << total << endl;
    return 0;
}
`,
      '4'
    );
    expect(t.stdout).toBe('sum=20\n');
    expect(local(t, 'total')).toEqual({ k: 'int', v: '20' });
  });

  it('reports runtime errors on the line that caused them', () => {
    const cases: [string, string, number][] = [
      ['int main() {\n    int *p = nullptr;\n    *p = 5;\n    return 0;\n}\n', 'NullDereference', 3],
      ['int main() {\n    int x;\n    int y = x + 1;\n    return 0;\n}\n', 'UninitializedRead', 3],
      ['int main() {\n    int a = 1, b = 0;\n    int c = a / b;\n    return 0;\n}\n', 'DivisionByZero', 3],
      ['int main() {\n    int *p = new int(1);\n    delete p;\n    delete p;\n    return 0;\n}\n', 'DoubleFree', 4],
      ['#include <stack>\nusing namespace std;\nint main() {\n    stack<int> s;\n    s.pop();\n    return 0;\n}\n', 'EmptyContainer', 5],
      ['int f(int n) {\n    return f(n + 1);\n}\nint main() {\n    return f(0);\n}\n', 'StackOverflow', 2],
    ];
    for (const [code, kind, line] of cases) {
      const t = run(code);
      expect(t.status, kind).toBe('error');
      expect(t.error?.kind).toBe(kind);
      expect(t.error?.line, kind).toBe(line);
      expect(last(t).kind).toBe('exception');
    }
  });

  it('stops infinite loops at the step limit', () => {
    const t = normalize(runClikeInterpreter('int main() {\n    int i = 0;\n    while (1) { i++; }\n}\n', { stepLimit: 200 }));
    expect(t.status).toBe('limit');
    expect(t.error?.kind).toBe('StepLimit');
  });

  it('reports syntax errors with a line number', () => {
    const t = runClikeInterpreter('int main() {\n    int x = 3\n    return 0;\n}\n');
    expect(t.status).toBe('error');
    expect(t.error?.phase).toBe('parse');
    expect(t.error?.line).toBe(3);
  });
});

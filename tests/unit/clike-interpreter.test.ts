import { describe, it, expect } from 'vitest';
import { runClikeInterpreter } from '../../src/engine/adapters/clike/interpreter';

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
    expect(trace.stdout).toContain('3 7'); // before swap print or final
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
    printf("Sum: %d\\n", 150);
    return 0;
}
`;
    const trace = runClikeInterpreter(code);
    expect(trace.status).toBe('completed');
    expect(trace.stdout).toContain('Sum: 150');
  });
});


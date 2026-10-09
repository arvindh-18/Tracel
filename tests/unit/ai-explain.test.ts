import { describe, expect, it } from 'vitest';
import { mergeExplanation, traceDigest } from '../../src/engine/adapters/ai/explainMerge';
import { runClikeInterpreter } from '../../src/engine/adapters/clike/interpreter';
import { normalize } from '../../src/trace/normalize';

const source = `#include <stack>
using namespace std;
int main() {
    stack<int> s;
    s.push(4);
    int x = 10 / 0;
    return 0;
}
`;
const trace = () => normalize(runClikeInterpreter(source));

describe('AI explain pass', () => {
  it('builds a compact digest with one line per step', () => {
    const t = trace();
    const digest = traceDigest(t)!;
    expect(digest).toHaveLength(t.steps.length);
    expect(digest.some((d) => d.includes('push 4'))).toBe(true);
    expect(digest[digest.length - 1]).toContain('error DivisionByZero');
  });

  it('merges narration, lens hints and the overview without changing state', () => {
    const t = trace();
    const merged = mergeExplanation(t, {
      overview: 'Pushes 4 onto a stack, then divides by zero.',
      narrations: t.steps.map((_, i) => `step ${i + 1}`),
      lensHints: [{ name: 's', lens: 'array' }],
    });
    expect(merged.steps.map((s) => s.narration)).toEqual(t.steps.map((_, i) => `step ${i + 1}`));
    expect(Object.values(merged.lensHints)).toContain('array');
    expect(merged.aiOverview).toBe('Pushes 4 onto a stack, then divides by zero.');
    expect(merged.error).toEqual(t.error);
    expect(merged.steps.map((s) => s.heap)).toEqual(t.steps.map((s) => s.heap));
    expect(merged.steps.length).toBe(t.steps.length);
    expect(t.steps[0]!.narration).not.toBe('step 1'); // the original trace is untouched
  });

  it('keeps the built-in narration when the counts do not match', () => {
    const t = trace();
    const merged = mergeExplanation(t, { overview: 'x', narrations: ['only one'] });
    expect(merged.steps.map((s) => s.narration)).toEqual(t.steps.map((s) => s.narration));
    expect(merged.aiNotice).toBeDefined();
  });
});

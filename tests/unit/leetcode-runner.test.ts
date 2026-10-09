import { spawnSync } from 'child_process';
import { describe, expect, it } from 'vitest';
import { buildProgram, findMethods, mapBack, parseTestCase, TestCaseError } from '../../src/features/leetcode/runner';
import { runClikeInterpreter } from '../../src/engine/adapters/clike/interpreter';
import { PYTHON_TRACER_CODE } from '../../src/engine/adapters/python/pyRunner';
import { normalize, RawTrace } from '../../src/trace/normalize';

const cppRun = (source: string, testCase: string, method?: string) => {
  const program = buildProgram('cpp', source, testCase, method);
  const raw = runClikeInterpreter(program.source, { stepLimit: 20000 });
  return normalize(mapBack(raw, program, source));
};

const python = spawnSync('python3', ['--version']).status === 0 ? 'python3' : null;
const pyRun = (source: string, testCase: string) => {
  const program = buildProgram('python', source, testCase);
  const script = `${PYTHON_TRACER_CODE}\nimport sys as _s\n_s.stdout = _s.__stdout__\nprint(run_tracel(${JSON.stringify(program.source)}, "", 5000))\n`;
  const out = spawnSync(python!, ['-I', '-'], { input: script, encoding: 'utf8' });
  const parsed = JSON.parse(out.stdout.trim().split('\n').pop()!);
  const raw: RawTrace = { language: 'python', source: program.source, ...parsed, error: parsed.error ?? undefined };
  return normalize(mapBack(raw, program, source));
};

const TWO_SUM_CPP = `class Solution {
public:
    vector<int> twoSum(vector<int>& nums, int target) {
        unordered_map<int, int> seen;
        for (int i = 0; i < nums.size(); i++) {
            if (seen.count(target - nums[i])) return {seen[target - nums[i]], i};
            seen[nums[i]] = i;
        }
        return {};
    }
};
`;

describe('LeetCode mode', () => {
  it('finds public Solution methods and their parameters', () => {
    expect(findMethods('cpp', TWO_SUM_CPP)).toEqual([
      { name: 'twoSum', returnType: 'vector<int>', params: [{ name: 'nums', type: 'vector<int>&' }, { name: 'target', type: 'int' }] },
    ]);
    expect(findMethods('python', 'class Solution:\n    def isValid(self, s: str) -> bool:\n        return True\n    def _helper(self): pass\n')).toEqual([
      { name: 'isValid', returnType: 'bool', params: [{ name: 's', type: 'str' }] },
    ]);
  });

  it('reads test cases one per line or in the problem statement format', () => {
    const params = [{ name: 'nums', type: '' }, { name: 'target', type: '' }];
    expect(parseTestCase('[2,7,11,15]\n9', params)).toEqual([[2, 7, 11, 15], 9]);
    expect(parseTestCase('nums = [2,7,11,15], target = 9', params)).toEqual([[2, 7, 11, 15], 9]);
    expect(() => parseTestCase('[1,2]', params)).toThrow(TestCaseError);
    expect(() => parseTestCase('[1,2\n3', params)).toThrow(/missing its closing \]/);
  });

  it('runs a C++ Solution and shows only the user code', () => {
    const t = cppRun(TWO_SUM_CPP, 'nums = [2,7,11,15], target = 9');
    expect(t.status).toBe('completed');
    expect(t.stdout).toBe('Output: [0,1]\n');
    expect(t.source).toBe(TWO_SUM_CPP);
    const lines = TWO_SUM_CPP.split('\n').length;
    expect(t.steps.every((s) => s.line >= 1 && s.line <= lines)).toBe(true);
    const inMethod = t.steps.find((s) => s.frames.length === 2)!;
    expect(inMethod.frames.map((f) => f.name)).toEqual(['LeetCode runner', 'Solution::twoSum']);
    expect(new Map(inMethod.frames[0]!.locals).has('nums')).toBe(true);
  });

  it('builds ListNode and TreeNode arguments and prints them back', () => {
    const rev = cppRun(
      `class Solution {
public:
    ListNode* reverseList(ListNode* head) {
        ListNode* prev = nullptr;
        while (head) { ListNode* n = head->next; head->next = prev; prev = head; head = n; }
        return prev;
    }
};
`,
      '[1,2,3,4,5]'
    );
    expect(rev.stdout).toBe('Output: [5,4,3,2,1]\n');
    const tree = cppRun(
      `class Solution {
public:
    int maxDepth(TreeNode* root) {
        if (!root) return 0;
        return 1 + max(maxDepth(root->left), maxDepth(root->right));
    }
    TreeNode* invertTree(TreeNode* root) {
        if (!root) return nullptr;
        swap(root->left, root->right);
        invertTree(root->left);
        invertTree(root->right);
        return root;
    }
};
`,
      '[3,9,20,null,null,15,7]'
    );
    expect(tree.stdout).toBe('Output: 3\n');
    expect(cppRun(tree.source, '[4,2,7,1,3,6,9]', 'invertTree').stdout).toBe('Output: [4,7,2,9,6,3,1]\n');
  });

  it('prints in-place results, strings, bools and nested vectors like LeetCode', () => {
    const t = cppRun(
      `class Solution {
public:
    void rotate(vector<int>& nums, int k) {
        k %= nums.size();
        reverse(nums.begin(), nums.end());
        reverse(nums.begin(), nums.begin() + k);
        reverse(nums.begin() + k, nums.end());
    }
};
`,
      '[1,2,3,4,5,6,7]\n3'
    );
    expect(t.stdout).toBe('Output: [5,6,7,1,2,3,4]\n');
    const g = cppRun(
      `class Solution {
public:
    vector<vector<string>> groupAnagrams(vector<string>& strs) {
        map<string, vector<string>> m;
        for (auto& s : strs) { string k = s; sort(k.begin(), k.end()); m[k].push_back(s); }
        vector<vector<string>> out;
        for (auto& [k, v] : m) out.push_back(v);
        return out;
    }
};
`,
      'strs = ["eat","tea","tan","ate","nat","bat"]'
    );
    expect(g.stdout).toBe('Output: [["bat"],["eat","tea","ate"],["tan","nat"]]\n');
  });

  it('maps runtime errors to the user line and test-case problems to a clear message', () => {
    const t = cppRun(
      `class Solution {
public:
    int pick(vector<int>& nums) {
        return nums[5];
    }
};
`,
      '[1,2,3]'
    );
    expect(t.error).toMatchObject({ kind: 'OutOfBounds', line: 4 });
    expect(() => buildProgram('cpp', 'int main() {}', '')).toThrow(/class Solution/);
  });

  it.skipIf(!python)('runs a Python Solution with List, ListNode and the module frame tidied', () => {
    const t = pyRun(
      `class Solution:
    def twoSum(self, nums: List[int], target: int) -> List[int]:
        seen = {}
        for i, x in enumerate(nums):
            if target - x in seen:
                return [seen[target - x], i]
            seen[x] = i
        return []
`,
      '[3,2,4]\n6'
    );
    expect(t.stdout).toBe('Output: [1,2]\n');
    const runner = t.steps.find((s) => s.frames[s.frames.length - 1]!.name === 'twoSum')!.frames[0]!;
    expect(runner.name).toBe('LeetCode runner');
    expect(runner.locals.map(([n]) => n).sort()).toEqual(['nums', 'target']);
    const tree = pyRun(
      `class Solution:
    def maxDepth(self, root: Optional[TreeNode]) -> int:
        if not root:
            return 0
        return 1 + max(self.maxDepth(root.left), self.maxDepth(root.right))
`,
      'root = [3,9,20,null,null,15,7]'
    );
    expect(tree.stdout).toBe('Output: 3\n');
  });
});

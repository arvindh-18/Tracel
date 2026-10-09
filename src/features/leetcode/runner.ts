import { RawTrace } from '../../trace/normalize';
import { TraceError } from '../../trace/schema';

// LeetCode mode: the user writes only `class Solution`, like on LeetCode, and
// types the test case. Tracel wraps the code in a hidden program: a preamble
// (headers, ListNode/TreeNode, helpers) above it and a runner (build the
// arguments, call the method, print the result) below it. After the run the
// trace is mapped back so it shows only the user's own lines.

export type LcLanguage = 'python' | 'c' | 'cpp';

export interface LcParam {
  name: string;
  type: string;
}

export interface LcMethod {
  name: string;
  returnType: string;
  params: LcParam[];
}

export interface LcProgram {
  source: string;
  /** Lines of preamble above the user's code. */
  offset: number;
  userLines: number;
  /** Characters of preamble above the user's code (for statement ranges). */
  charOffset: number;
}

export class TestCaseError extends Error {}

// ---------------------------------------------------------------- signatures

/** Splits on commas that are not inside <...>, (...), [...] or {...}. */
function splitTop(text: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = '';
  let quote = '';
  for (const ch of text) {
    if (quote) {
      cur += ch;
      if (ch === quote) quote = '';
      continue;
    }
    if (ch === '"' || ch === "'") quote = ch;
    if ('<([{'.includes(ch)) depth++;
    if ('>)]}'.includes(ch)) depth--;
    if (ch === ',' && depth === 0) {
      out.push(cur.trim());
      cur = '';
    } else cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

/** Public methods of `class Solution`, in order. */
export function findMethods(language: LcLanguage, source: string): LcMethod[] {
  if (language === 'python') {
    const body = source.slice(source.search(/class\s+Solution\b/));
    if (!/class\s+Solution\b/.test(source)) return [];
    const methods: LcMethod[] = [];
    for (const m of body.matchAll(/^[ \t]+def\s+(\w+)\s*\(\s*self\s*(?:,([^)]*))?\)\s*(?:->\s*([^:]+))?:/gm)) {
      if (m[1]!.startsWith('_')) continue;
      const params = m[2] ? splitTop(m[2]).map((p) => {
        const [name, type] = p.split(':').map((x) => x.trim());
        return { name: name!.replace(/=.*/, '').trim(), type: (type ?? '').replace(/=.*/, '').trim() };
      }) : [];
      methods.push({ name: m[1]!, returnType: (m[3] ?? '').trim(), params });
    }
    return methods;
  }
  const start = source.search(/\b(class|struct)\s+Solution\b/);
  if (start < 0) return [];
  const open = source.indexOf('{', start);
  let depth = 0;
  let end = source.length;
  for (let i = open; i < source.length; i++) {
    if (source[i] === '{') depth++;
    else if (source[i] === '}' && --depth === 0) {
      end = i;
      break;
    }
  }
  const body = source.slice(open + 1, end);
  const methods: LcMethod[] = [];
  // Only top-level members of the class: strip nested bodies first.
  let flat = '';
  depth = 0;
  for (const ch of body) {
    if (ch === '{') {
      if (depth === 0) flat += '{';
      depth++;
    } else if (ch === '}') {
      depth--;
    } else if (depth === 0) flat += ch;
  }
  let isPublic = /\bstruct\s+Solution\b/.test(source.slice(start, open));
  for (const part of flat.split(/(?=\b(?:public|private|protected)\s*:)/)) {
    const access = part.match(/^(public|private|protected)\s*:/);
    if (access) isPublic = access[1] === 'public';
    if (!isPublic) continue;
    for (const m of part.matchAll(/([A-Za-z_][\w:<>,\s*&]*?[\w>*&])\s+(\w+)\s*\(([^()]*)\)\s*(?:const\s*)?\{/g)) {
      const name = m[2]!;
      if (name === 'Solution' || ['if', 'for', 'while', 'switch', 'return'].includes(name)) continue;
      const params = splitTop(m[3]!).filter((p) => p && p !== 'void').map((p) => {
        const pm = p.match(/^(.*?)([A-Za-z_]\w*)\s*$/s)!;
        return { name: pm[2]!, type: pm[1]!.trim() };
      });
      methods.push({ name, returnType: m[1]!.replace(/\b(public|private|protected)\s*:/g, '').trim(), params });
    }
  }
  return methods;
}

// ---------------------------------------------------------------- test cases

type Json = number | string | boolean | null | Json[];

/** Reads one LeetCode-style value: [1,2,[3]], "abc", 'a', -4, 2.5, true, null. */
function parseValue(text: string): Json {
  let i = 0;
  const ws = () => {
    while (/\s/.test(text[i] ?? '')) i++;
  };
  const value = (): Json => {
    ws();
    const ch = text[i];
    if (ch === '[') {
      i++;
      const items: Json[] = [];
      ws();
      if (text[i] === ']') {
        i++;
        return items;
      }
      for (;;) {
        items.push(value());
        ws();
        if (text[i] === ',') i++;
        else if (text[i] === ']') {
          i++;
          return items;
        } else if (i >= text.length) throw new TestCaseError('A list in the test case is missing its closing ].');
        else throw new TestCaseError(`Expected , or ] at "${text.slice(i, i + 10)}"`);
      }
    }
    if (ch === '"' || ch === "'") {
      const q = ch;
      i++;
      let s = '';
      while (i < text.length && text[i] !== q) {
        if (text[i] === '\\') {
          s += text[i + 1] === 'n' ? '\n' : text[i + 1];
          i += 2;
        } else s += text[i++];
      }
      if (text[i] !== q) throw new TestCaseError('A string in the test case is missing its closing quote.');
      i++;
      return s;
    }
    const m = text.slice(i).match(/^(-?\d+(?:\.\d+)?(?:e-?\d+)?|true|false|null|None|True|False)/i);
    if (!m) throw new TestCaseError(`Couldn't read the value starting at "${text.slice(i, i + 12)}". Use LeetCode's format, e.g. [1,2,3] or "abc".`);
    i += m[0].length;
    const word = m[0].toLowerCase();
    if (word === 'true') return true;
    if (word === 'false') return false;
    if (word === 'null' || word === 'none') return null;
    return Number(m[0]);
  };
  const v = value();
  ws();
  if (i < text.length) throw new TestCaseError(`Unexpected "${text.slice(i, i + 10)}" after a value in the test case.`);
  return v;
}

/**
 * Accepts either LeetCode's console format (one argument per line) or the
 * example format from the problem statement (nums = [2,7,11,15], target = 9).
 */
export function parseTestCase(text: string, params: LcParam[]): Json[] {
  const trimmed = text.trim();
  if (!params.length) return [];
  if (!trimmed) throw new TestCaseError(`Enter a test case: ${params.map((p) => p.name).join(', ')}.`);
  let parts: string[];
  if (/^[A-Za-z_]\w*\s*=/.test(trimmed)) {
    const named = new Map(
      splitTop(trimmed.replace(/\n/g, ',')).map((pair) => {
        const at = pair.indexOf('=');
        return [pair.slice(0, at).trim(), pair.slice(at + 1).trim()] as const;
      })
    );
    parts = params.map((p) => {
      const v = named.get(p.name);
      if (v === undefined) throw new TestCaseError(`The test case has no value for "${p.name}".`);
      return v;
    });
  } else {
    parts = trimmed.split('\n').map((l) => l.trim()).filter(Boolean);
    if (parts.length !== params.length) {
      throw new TestCaseError(`This method takes ${params.length} argument${params.length === 1 ? '' : 's'} (${params.map((p) => p.name).join(', ')}), but the test case has ${parts.length} line${parts.length === 1 ? '' : 's'}. Put one argument per line.`);
    }
  }
  return parts.map(parseValue);
}

// ---------------------------------------------------------------- C++

const CPP_PREAMBLE_HEADER = '#include <bits/stdc++.h>\nusing namespace std;\n';
const CPP_LISTNODE = `struct ListNode {
    int val;
    ListNode *next;
    ListNode() : val(0), next(nullptr) {}
    ListNode(int x) : val(x), next(nullptr) {}
    ListNode(int x, ListNode *next) : val(x), next(next) {}
};`;
const CPP_TREENODE = `struct TreeNode {
    int val;
    TreeNode *left;
    TreeNode *right;
    TreeNode() : val(0), left(nullptr), right(nullptr) {}
    TreeNode(int x) : val(x), left(nullptr), right(nullptr) {}
    TreeNode(int x, TreeNode *left, TreeNode *right) : val(x), left(left), right(right) {}
};`;

const NULL_SENTINEL = -2147483648;

function cppType(raw: string): string {
  return raw.replace(/\bconst\b/g, '').replace(/&/g, '').replace(/\s+/g, ' ').trim();
}

/** A C++ expression of type `type` holding `v`. */
function cppLiteral(v: Json, type: string): string {
  const t = cppType(type);
  if (/^ListNode\s*\*$/.test(t)) {
    if (!Array.isArray(v)) throw new TestCaseError('A linked list is written as [1,2,3].');
    return `__buildList(vector<int>{${v.map((x) => cppLiteral(x, 'int')).join(', ')}})`;
  }
  if (/^TreeNode\s*\*$/.test(t)) {
    if (!Array.isArray(v)) throw new TestCaseError('A tree is written level by level, e.g. [3,9,20,null,null,15,7].');
    return `__buildTree(vector<int>{${v.map((x) => (x === null ? String(NULL_SENTINEL) : cppLiteral(x, 'int'))).join(', ')}})`;
  }
  const vec = t.match(/^vector\s*<(.*)>$/);
  if (vec) {
    if (!Array.isArray(v)) throw new TestCaseError(`Expected a list like [...] for ${t}.`);
    return `${t}{${v.map((x) => cppLiteral(x, vec[1]!)).join(', ')}}`;
  }
  if (t === 'string') {
    if (typeof v !== 'string') throw new TestCaseError(`Expected a string in quotes for ${t}.`);
    return JSON.stringify(v);
  }
  if (t === 'char') {
    const s = typeof v === 'string' ? v : String(v);
    return `'${s === "'" ? "\\'" : s === '\\' ? '\\\\' : s[0] ?? ' '}'`;
  }
  if (t === 'bool') return v ? 'true' : 'false';
  if (typeof v === 'number') return /long/.test(t) ? `${v}LL` : String(v);
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  throw new TestCaseError(`Tracel can't build a ${t} from ${JSON.stringify(v)} yet.`);
}

/** Statements that print `expr` (of type `type`) in LeetCode's output format. */
function cppPrint(expr: string, type: string, depth = 0): string {
  const t = cppType(type);
  const vec = t.match(/^vector\s*<(.*)>$/);
  if (vec) {
    const x = `__x${depth}`;
    const first = `__first${depth}`;
    return `{ cout << "["; bool ${first} = true; for (auto& ${x} : ${expr}) { if (!${first}) cout << ","; ${first} = false; ${cppPrint(x, vec[1]!, depth + 1)} } cout << "]"; }`;
  }
  if (/^ListNode\s*\*$/.test(t)) return `__printList(${expr});`;
  if (/^TreeNode\s*\*$/.test(t)) return `__printTree(${expr});`;
  if (t === 'bool') return `cout << (${expr} ? "true" : "false");`;
  if (t === 'string') return `cout << "\\"" << ${expr} << "\\"";`;
  if (t === 'char') return `cout << "\\"" << ${expr} << "\\"";`;
  if (t === 'double' || t === 'float') return `printf("%.5f", (double)(${expr}));`;
  return `cout << ${expr};`;
}

function buildCpp(source: string, method: LcMethod, args: Json[]): { preamble: string; runner: string } {
  const hasList = /\b(struct|class)\s+ListNode\b/.test(source);
  const hasTree = /\b(struct|class)\s+TreeNode\b/.test(source);
  const usesList = /\bListNode\b/.test(source);
  const usesTree = /\bTreeNode\b/.test(source);
  const parts = [CPP_PREAMBLE_HEADER];
  if (usesList && !hasList) parts.push(CPP_LISTNODE + '\n');
  if (usesTree && !hasTree) parts.push(CPP_TREENODE + '\n');
  const preamble = parts.join('');

  // Helpers go after the user's code so they can use ListNode/TreeNode either way.
  const helpers: string[] = [];
  if (usesList) {
    helpers.push(`ListNode* __buildList(vector<int> vals) {
    ListNode* head = nullptr;
    for (int i = vals.size() - 1; i >= 0; i--) head = new ListNode(vals[i], head);
    return head;
}
void __printList(ListNode* p) {
    cout << "[";
    for (bool first = true; p; p = p->next) { if (!first) cout << ","; first = false; cout << p->val; }
    cout << "]";
}`);
  }
  if (usesTree) {
    helpers.push(`TreeNode* __buildTree(vector<int> vals) {
    if (vals.empty() || vals[0] == ${NULL_SENTINEL}) return nullptr;
    TreeNode* root = new TreeNode(vals[0]);
    queue<TreeNode*> q;
    q.push(root);
    int i = 1;
    while (!q.empty() && i < vals.size()) {
        TreeNode* node = q.front();
        q.pop();
        if (i < vals.size() && vals[i] != ${NULL_SENTINEL}) { node->left = new TreeNode(vals[i]); q.push(node->left); }
        i++;
        if (i < vals.size() && vals[i] != ${NULL_SENTINEL}) { node->right = new TreeNode(vals[i]); q.push(node->right); }
        i++;
    }
    return root;
}
void __printTree(TreeNode* root) {
    vector<string> out;
    queue<TreeNode*> q;
    q.push(root);
    while (!q.empty()) {
        TreeNode* n = q.front();
        q.pop();
        if (n) { out.push_back(to_string(n->val)); q.push(n->left); q.push(n->right); }
        else out.push_back("null");
    }
    while (!out.empty() && out.back() == "null") out.pop_back();
    cout << "[";
    for (int i = 0; i < out.size(); i++) { if (i) cout << ","; cout << out[i]; }
    cout << "]";
}`);
  }

  const decls = method.params.map((p, i) => `    ${cppType(p.type)} ${p.name} = ${cppLiteral(args[i]!, p.type)};`);
  const call = `solution.${method.name}(${method.params.map((p) => p.name).join(', ')})`;
  const isVoid = cppType(method.returnType) === 'void';
  const show = isVoid
    ? method.params[0]
      ? cppPrint(method.params[0].name, method.params[0].type)
      : 'cout << "null";'
    : cppPrint('result', method.returnType);
  const runner = [
    '',
    ...helpers,
    'int main() {',
    ...decls,
    '    Solution solution;',
    isVoid ? `    ${call};` : `    ${cppType(method.returnType)} result = ${call};`,
    `    cout << "Output: ";`,
    `    ${show}`,
    '    cout << endl;',
    '    return 0;',
    '}',
    '',
  ].join('\n');
  return { preamble, runner };
}

// ---------------------------------------------------------------- Python

const PY_PREAMBLE = `from typing import List, Optional, Dict, Tuple, Set
from collections import deque, defaultdict, Counter
import heapq, math, bisect
class ListNode:
    def __init__(self, val=0, next=None):
        self.val = val
        self.next = next
class TreeNode:
    def __init__(self, val=0, left=None, right=None):
        self.val = val
        self.left = left
        self.right = right
`;

function pyLiteral(v: Json, type: string): string {
  const t = type.replace(/\s+/g, '');
  if (/ListNode/.test(t)) {
    if (!Array.isArray(v)) throw new TestCaseError('A linked list is written as [1,2,3].');
    return `_build_list(${JSON.stringify(v)})`;
  }
  if (/TreeNode/.test(t)) {
    if (!Array.isArray(v)) throw new TestCaseError('A tree is written level by level, e.g. [3,9,20,null,null,15,7].');
    return `_build_tree([${v.map((x) => (x === null ? 'None' : JSON.stringify(x))).join(', ')}])`;
  }
  const lit = (x: Json): string =>
    x === null ? 'None' : x === true ? 'True' : x === false ? 'False' : Array.isArray(x) ? `[${x.map(lit).join(', ')}]` : JSON.stringify(x);
  return lit(v);
}

function buildPython(method: LcMethod, args: Json[]): { preamble: string; runner: string } {
  const decls = method.params.map((p, i) => `${p.name} = ${pyLiteral(args[i]!, p.type)}`);
  const call = `Solution().${method.name}(${method.params.map((p) => p.name).join(', ')})`;
  const runner = `
def _build_list(vals):
    head = None
    for v in reversed(vals):
        head = ListNode(v, head)
    return head
def _build_tree(vals):
    if not vals or vals[0] is None:
        return None
    root = TreeNode(vals[0])
    q, i = deque([root]), 1
    while q and i < len(vals):
        node = q.popleft()
        if i < len(vals) and vals[i] is not None:
            node.left = TreeNode(vals[i]); q.append(node.left)
        i += 1
        if i < len(vals) and vals[i] is not None:
            node.right = TreeNode(vals[i]); q.append(node.right)
        i += 1
    return root
def _fmt(x):
    if isinstance(x, bool): return "true" if x else "false"
    if x is None: return "null"
    if isinstance(x, ListNode):
        out = []
        while x: out.append(_fmt(x.val)); x = x.next
        return "[" + ",".join(out) + "]"
    if isinstance(x, TreeNode):
        out, q = [], deque([x])
        while q:
            n = q.popleft()
            if n: out.append(_fmt(n.val)); q.append(n.left); q.append(n.right)
            else: out.append("null")
        while out and out[-1] == "null": out.pop()
        return "[" + ",".join(out) + "]"
    if isinstance(x, (list, tuple)): return "[" + ",".join(_fmt(v) for v in x) + "]"
    if isinstance(x, str): return '"' + x + '"'
    if isinstance(x, float): return f"{x:.5f}"
    return str(x)
${decls.join('\n')}
result = ${call}
print("Output: " + _fmt(${method.returnType.replace(/\s/g, '') === 'None' && method.params[0] ? method.params[0].name : 'result'}))
`;
  return { preamble: PY_PREAMBLE, runner };
}

// ---------------------------------------------------------------- build & map back

export function buildProgram(language: LcLanguage, source: string, testCase: string, methodName?: string): LcProgram {
  if (language === 'c') throw new TestCaseError('LeetCode mode is available for C++ and Python.');
  const methods = findMethods(language, source);
  if (!methods.length) {
    throw new TestCaseError(
      language === 'python'
        ? 'LeetCode mode needs a class Solution with a method, e.g.\nclass Solution:\n    def twoSum(self, nums: List[int], target: int) -> List[int]:'
        : 'LeetCode mode needs a class Solution with a public method, e.g.\nclass Solution {\npublic:\n    vector<int> twoSum(vector<int>& nums, int target) { ... }\n};'
    );
  }
  const method = methods.find((m) => m.name === methodName) ?? methods[0]!;
  const args = parseTestCase(testCase, method.params);
  const { preamble, runner } = language === 'python' ? buildPython(method, args) : buildCpp(source, method, args);
  const body = source.endsWith('\n') ? source : source + '\n';
  return {
    source: preamble + body + runner,
    offset: preamble.split('\n').length - 1,
    userLines: body.split('\n').length - 1,
    charOffset: preamble.length,
  };
}

/** Keeps only steps on the user's lines and renumbers everything to the user's source. */
export function mapBack(raw: RawTrace, program: LcProgram, userSource: string): RawTrace {
  const { offset, userLines, charOffset } = program;
  const inUser = (line: number) => line > offset && line <= offset + userLines;
  const toUser = (line: number) => (inUser(line) ? line - offset : 0);
  const rename = (name: string) => (name === 'main' || name === '<module>' ? 'LeetCode runner' : name);

  const steps: RawTrace['steps'] = raw.steps
    .filter((s) => inUser(s.line) || s.error)
    .map((s) => ({
      ...s,
      line: toUser(s.line) || (s.error ? Math.max(1, toUser(s.error.line)) : 1),
      range: s.range ? { from: s.range.from - charOffset, to: s.range.to - charOffset } : undefined,
      frames: s.frames
        .filter((f) => f.name !== 'globals')
        .map((f) => {
          const runner = f.name === 'main' || f.name === '<module>';
          // The runner frame shows the test-case arguments, not the preamble's helpers and classes.
          const locals = runner ? f.locals.filter(([n, v]) => v.k !== 'fn' && !n.startsWith('_')) : f.locals;
          // The runner's own line is hidden code, so it has no line number to show.
          return { ...f, name: rename(f.name), line: runner ? 0 : toUser(f.line) || f.line, locals };
        }),
    }));

  let error: TraceError | undefined = raw.error;
  if (error) {
    const inside = inUser(error.line);
    error = inside
      ? { ...error, line: error.line - offset }
      : { ...error, line: 1, explanation: `${error.explanation} (This happened in Tracel's LeetCode runner, so check the test case and the method's return type.)` };
  }
  if (!steps.length && raw.steps.length) {
    // Nothing ran on the user's lines (e.g. the method body is empty): keep the last step.
    const last = raw.steps[raw.steps.length - 1]!;
    steps.push({ ...last, line: 1, frames: last.frames.map((f) => ({ ...f, name: rename(f.name), line: 1 })) });
  }
  return { ...raw, source: userSource, steps, error };
}

export function testCaseError(err: unknown): TraceError {
  const message = err instanceof Error ? err.message : String(err);
  return {
    phase: 'parse',
    kind: 'TestCaseError',
    line: 1,
    message,
    title: 'Check the test case',
    explanation: message,
    context: [],
  };
}

import { describe, expect, it } from 'vitest';
import { runClikeInterpreter } from '../../src/engine/adapters/clike/interpreter';
import { normalize } from '../../src/trace/normalize';

// Typical LeetCode C++ solutions, each with a small main() driving it.
const HEADER = `#include <bits/stdc++.h>
using namespace std;
`;

function run(body: string, stdin?: string) {
  const raw = runClikeInterpreter(HEADER + body, { stdin, stepLimit: 20000 });
  if (raw.status !== 'completed') throw new Error(`${raw.error?.kind} on line ${raw.error?.line}: ${raw.error?.message}`);
  return { ...normalize(raw), raw };
}

describe('LeetCode-style C++', () => {
  it('two sum with unordered_map, class Solution and return {i, j}', () => {
    const t = run(`
class Solution {
public:
    vector<int> twoSum(vector<int>& nums, int target) {
        unordered_map<int, int> seen;
        for (int i = 0; i < nums.size(); i++) {
            int need = target - nums[i];
            if (seen.count(need)) return {seen[need], i};
            seen[nums[i]] = i;
        }
        return {};
    }
};
int main() {
    Solution s;
    vector<int> nums = {2, 7, 11, 15};
    vector<int> ans = s.twoSum(nums, 9);
    cout << ans[0] << " " << ans[1] << endl;
}
`);
    expect(t.stdout).toBe('0 1\n');
    const last = t.steps.find((s) => s.frames.some((f) => f.name === 'Solution::twoSum') && Object.keys(s.heap).length > 0)!;
    expect(last).toBeDefined();
    const dicts = Object.values(t.heapVersions).flat().filter((o) => o.kind === 'dict');
    expect(dicts.length).toBeGreaterThan(0);
    expect(dicts[dicts.length - 1]!.typeName).toBe('std::unordered_map<int, int>');
  });

  it('group anagrams: map of vectors, sorted keys, structured bindings', () => {
    const t = run(`
int main() {
    vector<string> words = {"eat", "tea", "tan", "ate", "nat", "bat"};
    map<string, vector<string>> groups;
    for (string w : words) {
        string key = w;
        sort(key.begin(), key.end());
        groups[key].push_back(w);
    }
    for (auto& [key, list] : groups) {
        cout << key << ":";
        for (auto& w : list) cout << " " << w;
        cout << endl;
    }
}
`);
    expect(t.stdout).toBe('abt: bat\naet: eat tea ate\nant: tan nat\n');
  });

  it('valid parentheses with stack<char> and a string loop', () => {
    const t = run(`
bool isValid(string s) {
    stack<char> st;
    unordered_map<char, char> match = {{')', '('}, {']', '['}, {'}', '{'}};
    for (char c : s) {
        if (match.count(c)) {
            if (st.empty() || st.top() != match[c]) return false;
            st.pop();
        } else {
            st.push(c);
        }
    }
    return st.empty();
}
int main() {
    cout << isValid("({[]})") << isValid("(]") << isValid("((") << endl;
}
`);
    expect(t.stdout).toBe('100\n');
  });

  it('top k frequent with a min-heap of pairs', () => {
    const t = run(`
int main() {
    vector<int> nums = {1, 1, 1, 2, 2, 3, 4, 4, 4, 4};
    int k = 2;
    unordered_map<int, int> freq;
    for (int x : nums) freq[x]++;
    priority_queue<pair<int, int>, vector<pair<int, int>>, greater<pair<int, int>>> pq;
    for (auto& [num, f] : freq) {
        pq.push({f, num});
        if (pq.size() > k) pq.pop();
    }
    vector<int> ans;
    while (!pq.empty()) { ans.push_back(pq.top().second); pq.pop(); }
    cout << ans[0] << " " << ans[1] << endl;
}
`);
    expect(t.stdout).toBe('1 4\n');
    expect(Object.values(t.heapVersions).flat().some((o) => o.kind === 'cpp_priority_queue')).toBe(true);
  });

  it('kth largest with priority_queue<int, vector<int>, greater<int>> kept as a heap', () => {
    const t = run(`
int main() {
    vector<int> nums = {3, 2, 1, 5, 6, 4};
    priority_queue<int, vector<int>, greater<int>> heap;
    for (int x : nums) {
        heap.push(x);
        if (heap.size() > 2) heap.pop();
    }
    cout << heap.top() << endl;
    priority_queue<int> maxHeap(nums.begin(), nums.end());
    cout << maxHeap.top() << endl;
}
`);
    expect(t.stdout).toBe('5\n6\n');
  });

  it('merge intervals: sort with a lambda comparator and back()', () => {
    const t = run(`
int main() {
    vector<vector<int>> intervals = {{8, 10}, {1, 3}, {15, 18}, {2, 6}};
    sort(intervals.begin(), intervals.end(), [](const vector<int>& a, const vector<int>& b) { return a[0] < b[0]; });
    vector<vector<int>> merged;
    for (auto& in : intervals) {
        if (merged.empty() || merged.back()[1] < in[0]) merged.push_back(in);
        else merged.back()[1] = max(merged.back()[1], in[1]);
    }
    for (auto& m : merged) cout << "[" << m[0] << "," << m[1] << "]";
    cout << endl;
}
`);
    expect(t.stdout).toBe('[1,6][8,10][15,18]\n');
  });

  it('number of islands: BFS with queue<pair<int,int>> and auto [r, c]', () => {
    const t = run(`
int main() {
    vector<vector<char>> grid = {
        {'1', '1', '0', '0'},
        {'1', '0', '0', '1'},
        {'0', '0', '1', '1'}};
    int rows = grid.size(), cols = grid[0].size(), islands = 0;
    int dr[4] = {1, -1, 0, 0}, dc[4] = {0, 0, 1, -1};
    for (int i = 0; i < rows; i++)
        for (int j = 0; j < cols; j++) {
            if (grid[i][j] != '1') continue;
            islands++;
            queue<pair<int, int>> q;
            q.push({i, j});
            grid[i][j] = '0';
            while (!q.empty()) {
                auto [r, c] = q.front();
                q.pop();
                for (int d = 0; d < 4; d++) {
                    int nr = r + dr[d], nc = c + dc[d];
                    if (nr >= 0 && nr < rows && nc >= 0 && nc < cols && grid[nr][nc] == '1') {
                        grid[nr][nc] = '0';
                        q.push({nr, nc});
                    }
                }
            }
        }
    cout << islands << endl;
}
`);
    expect(t.stdout).toBe('2\n');
  });

  it('reverse a linked list built from ListNode constructors', () => {
    const t = run(`
struct ListNode {
    int val;
    ListNode *next;
    ListNode() : val(0), next(nullptr) {}
    ListNode(int x) : val(x), next(nullptr) {}
    ListNode(int x, ListNode *next) : val(x), next(next) {}
};
ListNode* reverseList(ListNode* head) {
    ListNode* prev = nullptr;
    while (head) {
        ListNode* nxt = head->next;
        head->next = prev;
        prev = head;
        head = nxt;
    }
    return prev;
}
int main() {
    ListNode* head = new ListNode(1, new ListNode(2, new ListNode(3)));
    head = reverseList(head);
    for (ListNode* p = head; p; p = p->next) cout << p->val;
    cout << endl;
}
`);
    expect(t.stdout).toBe('321\n');
  });

  it('binary tree depth and inorder with TreeNode and std::function', () => {
    const t = run(`
struct TreeNode {
    int val;
    TreeNode *left, *right;
    TreeNode(int x) : val(x), left(nullptr), right(nullptr) {}
};
int maxDepth(TreeNode* root) {
    if (!root) return 0;
    return 1 + max(maxDepth(root->left), maxDepth(root->right));
}
int main() {
    TreeNode* root = new TreeNode(3);
    root->left = new TreeNode(9);
    root->right = new TreeNode(20);
    root->right->left = new TreeNode(15);
    root->right->right = new TreeNode(7);
    vector<int> order;
    function<void(TreeNode*)> inorder = [&](TreeNode* n) {
        if (!n) return;
        inorder(n->left);
        order.push_back(n->val);
        inorder(n->right);
    };
    inorder(root);
    cout << maxDepth(root) << ":";
    for (int v : order) cout << " " << v;
    cout << endl;
}
`);
    expect(t.stdout).toBe('3: 9 3 15 20 7\n');
    const tree = Object.entries(t.lensHints).find(([, lens]) => lens === 'tree');
    expect(tree).toBeDefined();
  });

  it('dynamic programming: climbing stairs, coin change and memset', () => {
    const t = run(`
int memo[50];
int climb(int n) {
    if (n <= 2) return n;
    if (memo[n] != -1) return memo[n];
    return memo[n] = climb(n - 1) + climb(n - 2);
}
int main() {
    memset(memo, -1, sizeof memo);
    vector<int> coins = {1, 2, 5};
    int amount = 11;
    vector<int> dp(amount + 1, INT_MAX);
    dp[0] = 0;
    for (int a = 1; a <= amount; a++)
        for (int c : coins)
            if (c <= a && dp[a - c] != INT_MAX) dp[a] = min(dp[a], dp[a - c] + 1);
    vector<vector<int>> grid(3, vector<int>(4, 1));
    for (int i = 1; i < 3; i++)
        for (int j = 1; j < 4; j++) grid[i][j] = grid[i - 1][j] + grid[i][j - 1];
    cout << climb(10) << " " << dp[amount] << " " << grid[2][3] << endl;
}
`);
    expect(t.stdout).toBe('89 3 10\n');
  });

  it('longest substring without repeats: unordered_set and string indexing', () => {
    const t = run(`
int main() {
    string s = "abcabcbb";
    unordered_set<char> window;
    int best = 0, left = 0;
    for (int right = 0; right < s.size(); right++) {
        while (window.count(s[right])) window.erase(s[left++]);
        window.insert(s[right]);
        best = max(best, right - left + 1);
    }
    cout << best << endl;
}
`);
    expect(t.stdout).toBe('3\n');
  });

  it('design problem: MinStack whose member functions change member containers', () => {
    const t = run(`
class MinStack {
    stack<int> values;
    stack<int> mins;
public:
    void push(int x) {
        values.push(x);
        if (mins.empty() || x <= mins.top()) mins.push(x);
    }
    void pop() {
        if (values.top() == mins.top()) mins.pop();
        values.pop();
    }
    int top() { return values.top(); }
    int getMin() { return mins.top(); }
};
int main() {
    MinStack st;
    st.push(-2); st.push(0); st.push(-3);
    cout << st.getMin() << " ";
    st.pop();
    cout << st.top() << " " << st.getMin() << endl;
}
`);
    expect(t.stdout).toBe('-3 0 -2\n');
    // The member stacks are real heap objects in the trace.
    expect(Object.values(t.heapVersions).flat().filter((o) => o.kind === 'cpp_stack').length).toBeGreaterThanOrEqual(2);
  });

  it('strings: mutate characters, reverse, find, to_string and stoi', () => {
    const t = run(`
int main() {
    string s = "hello world";
    s[0] = toupper(s[0]);
    reverse(s.begin() + 6, s.end());
    int at = s.find("dl");
    string n = to_string(stoi("41") + 1);
    cout << s << " " << at << " " << n << " " << (s.find("zzz") == string::npos) << endl;
}
`);
    expect(t.stdout).toBe('Hello dlrow 6 42 1\n');
  });

  it('algorithm helpers: max_element, accumulate, lower_bound, count and map iteration', () => {
    const t = run(`
int main() {
    vector<int> v = {4, 1, 7, 3, 7};
    int biggest = *max_element(v.begin(), v.end());
    int total = accumulate(v.begin(), v.end(), 0);
    int sevens = count(v.begin(), v.end(), 7);
    sort(v.begin(), v.end());
    int pos = lower_bound(v.begin(), v.end(), 5) - v.begin();
    map<string, int> score = {{"bob", 3}, {"amy", 5}};
    score["cat"] = 1;
    auto it = score.find("amy");
    cout << biggest << " " << total << " " << sevens << " " << pos << " " << it->second << " " << score.begin()->first << " " << max({3, 9, 2}) << endl;
}
`);
    expect(t.stdout).toBe('7 22 2 3 5 amy 9\n');
  });

  it('explains how to run a LeetCode class with no main', () => {
    const raw = runClikeInterpreter(HEADER + 'class Solution {\npublic:\n    int f() { return 1; }\n};\n');
    expect(raw.error?.kind).toBe('NoMain');
    expect(raw.error?.explanation).toContain('Solution s;');
  });
});

describe('map versions', () => {
  it('records every change to a map as a new heap version with entry events', () => {
    const t = normalize(
      runClikeInterpreter('#include <map>\n#include <string>\nusing namespace std;\nint main() {\n    map<string, int> freq;\n    for (string w : {"a", "b", "a"}) freq[w]++;\n    int n = freq.size();\n    return 0;\n}\n')
    );
    const last = t.steps[t.steps.length - 1]!;
    const map = Object.entries(last.heap).map(([id, v]) => t.heapVersions[id]![v]!).find((o) => o.kind === 'dict')!;
    expect(map.entries).toEqual([
      [{ k: 'str', v: 'a' }, { k: 'int', v: '2' }],
      [{ k: 'str', v: 'b' }, { k: 'int', v: '1' }],
    ]);
    expect(t.steps.filter((s) => s.events.some((e) => e.type === 'entry_set')).length).toBe(3);
  });
});

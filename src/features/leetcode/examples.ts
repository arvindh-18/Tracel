// Built-in LeetCode-mode problems: a Solution class plus a test case, like on LeetCode.
export interface LcExample {
  id: string;
  language: 'python' | 'cpp';
  title: string;
  code: string;
  testCase: string;
}

export const LC_EXAMPLES: LcExample[] = [
  {
    id: 'lc-cpp-two-sum',
    language: 'cpp',
    title: '1. Two Sum',
    testCase: 'nums = [2,7,11,15], target = 9',
    code: `class Solution {
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
`,
  },
  {
    id: 'lc-cpp-valid-parentheses',
    language: 'cpp',
    title: '20. Valid Parentheses',
    testCase: 's = "({[]})"',
    code: `class Solution {
public:
    bool isValid(string s) {
        stack<char> st;
        for (char c : s) {
            if (c == '(' || c == '[' || c == '{') {
                st.push(c);
            } else {
                if (st.empty()) return false;
                char open = st.top();
                st.pop();
                if ((c == ')' && open != '(') || (c == ']' && open != '[') || (c == '}' && open != '{')) return false;
            }
        }
        return st.empty();
    }
};
`,
  },
  {
    id: 'lc-cpp-reverse-list',
    language: 'cpp',
    title: '206. Reverse Linked List',
    testCase: 'head = [1,2,3,4,5]',
    code: `class Solution {
public:
    ListNode* reverseList(ListNode* head) {
        ListNode* prev = nullptr;
        ListNode* curr = head;
        while (curr) {
            ListNode* next = curr->next;
            curr->next = prev;
            prev = curr;
            curr = next;
        }
        return prev;
    }
};
`,
  },
  {
    id: 'lc-cpp-max-depth',
    language: 'cpp',
    title: '104. Maximum Depth of Binary Tree',
    testCase: 'root = [3,9,20,null,null,15,7]',
    code: `class Solution {
public:
    int maxDepth(TreeNode* root) {
        if (root == nullptr) return 0;
        int left = maxDepth(root->left);
        int right = maxDepth(root->right);
        return 1 + max(left, right);
    }
};
`,
  },
  {
    id: 'lc-cpp-kth-largest',
    language: 'cpp',
    title: '215. Kth Largest Element',
    testCase: 'nums = [3,2,1,5,6,4], k = 2',
    code: `class Solution {
public:
    int findKthLargest(vector<int>& nums, int k) {
        priority_queue<int, vector<int>, greater<int>> heap;
        for (int x : nums) {
            heap.push(x);
            if (heap.size() > k) heap.pop();
        }
        return heap.top();
    }
};
`,
  },
  {
    id: 'lc-py-two-sum',
    language: 'python',
    title: '1. Two Sum',
    testCase: 'nums = [2,7,11,15], target = 9',
    code: `class Solution:
    def twoSum(self, nums: List[int], target: int) -> List[int]:
        seen = {}
        for i, x in enumerate(nums):
            if target - x in seen:
                return [seen[target - x], i]
            seen[x] = i
        return []
`,
  },
  {
    id: 'lc-py-reverse-list',
    language: 'python',
    title: '206. Reverse Linked List',
    testCase: 'head = [1,2,3,4,5]',
    code: `class Solution:
    def reverseList(self, head: Optional[ListNode]) -> Optional[ListNode]:
        prev, curr = None, head
        while curr:
            nxt = curr.next
            curr.next = prev
            prev = curr
            curr = nxt
        return prev
`,
  },
  {
    id: 'lc-py-max-depth',
    language: 'python',
    title: '104. Maximum Depth of Binary Tree',
    testCase: 'root = [3,9,20,null,null,15,7]',
    code: `class Solution:
    def maxDepth(self, root: Optional[TreeNode]) -> int:
        if not root:
            return 0
        return 1 + max(self.maxDepth(root.left), self.maxDepth(root.right))
`,
  },
  {
    id: 'lc-py-num-islands',
    language: 'python',
    title: '200. Number of Islands',
    testCase: 'grid = [["1","1","0"],["1","0","0"],["0","0","1"]]',
    code: `class Solution:
    def numIslands(self, grid: List[List[str]]) -> int:
        rows, cols = len(grid), len(grid[0])
        count = 0
        for r in range(rows):
            for c in range(cols):
                if grid[r][c] == "1":
                    count += 1
                    stack = [(r, c)]
                    grid[r][c] = "0"
                    while stack:
                        i, j = stack.pop()
                        for ni, nj in ((i + 1, j), (i - 1, j), (i, j + 1), (i, j - 1)):
                            if 0 <= ni < rows and 0 <= nj < cols and grid[ni][nj] == "1":
                                grid[ni][nj] = "0"
                                stack.append((ni, nj))
        return count
`,
  },
];

export function defaultLcExample(language: 'python' | 'c' | 'cpp'): LcExample | undefined {
  return LC_EXAMPLES.find((e) => e.language === language);
}

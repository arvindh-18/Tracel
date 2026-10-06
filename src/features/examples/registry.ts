export interface Example {
  id: string;
  language: 'python' | 'c' | 'cpp';
  title: string;
  category: 'Basics' | 'Structures' | 'Algorithms' | 'Errors';
  description: string;
  code: string;
}

export const EXAMPLES: Example[] = [
  // --- PYTHON BASICS ---
  {
    id: 'py-variables',
    language: 'python',
    title: 'Variables',
    category: 'Basics',
    description: 'Create variables and observe state change',
    code: `x = 10
y = 20
z = x + y
print(z)
`,
  },
  {
    id: 'py-conditionals',
    language: 'python',
    title: 'Conditionals',
    category: 'Basics',
    description: 'Branch evaluation and taken path',
    code: `x = 10
if x > 5:
    x = 20
else:
    x = 0
`,
  },
  {
    id: 'py-loops',
    language: 'python',
    title: 'Loops',
    category: 'Basics',
    description: 'For loop accumulation and iteration counting',
    code: `total = 0
for i in range(5):
    total += i
print("Final total:", total)
`,
  },
  {
    id: 'py-functions',
    language: 'python',
    title: 'Functions',
    category: 'Basics',
    description: 'Call frame push and return value pop',
    code: `def add(a, b):
    return a + b

result = add(10, 20)
print(result)
`,
  },
  {
    id: 'py-recursion',
    language: 'python',
    title: 'Recursion (Factorial)',
    category: 'Basics',
    description: 'Deep stack frames and unwinding',
    code: `def fact(n):
    if n <= 1:
        return 1
    return n * fact(n - 1)

print(fact(4))
`,
  },

  // --- PYTHON STRUCTURES ---
  {
    id: 'py-arrays',
    language: 'python',
    title: 'Array Mutation',
    category: 'Structures',
    description: 'In-place element update and active index marker',
    code: `numbers = [10, 20, 30]
for i in range(len(numbers)):
    numbers[i] *= 2
print(numbers)
`,
  },
  {
    id: 'py-stack',
    language: 'python',
    title: 'Stack (LIFO)',
    category: 'Structures',
    description: 'Push drop-in and pop exit animations',
    code: `# tracel: stack = stack
stack = []
stack.append(10)
stack.append(20)
stack.append(30)
top = stack.pop()
print("Popped:", top)
`,
  },
  {
    id: 'py-queue',
    language: 'python',
    title: 'Queue (FIFO)',
    category: 'Structures',
    description: 'Enqueue rear and dequeue front shift',
    code: `from collections import deque
# tracel: queue = queue
queue = deque()
queue.append("A")
queue.append("B")
queue.append("C")
first = queue.popleft()
print("Dequeued:", first)
`,
  },
  {
    id: 'py-linkedlist',
    language: 'python',
    title: 'Linked List',
    category: 'Structures',
    description: 'Node chaining and pointer arrows',
    code: `class Node:
    def __init__(self, val, next=None):
        self.val = val
        self.next = next

head = Node(1, Node(2, Node(3)))
curr = head
while curr:
    print(curr.val)
    curr = curr.next
`,
  },
  {
    id: 'py-aliasing',
    language: 'python',
    title: 'Object Aliasing',
    category: 'Structures',
    description: 'Two names referencing one heap object',
    code: `a = [1, 2]
b = a
b.append(3)
print("a is:", a)
`,
  },

  // --- PYTHON ALGORITHMS ---
  {
    id: 'py-bubble-sort',
    language: 'python',
    title: 'Bubble Sort',
    category: 'Algorithms',
    description: 'Pairwise comparisons and swap arcs',
    code: `nums = [5, 2, 8, 1, 4]
n = len(nums)
for i in range(n):
    for j in range(0, n - i - 1):
        if nums[j] > nums[j + 1]:
            # swap
            nums[j], nums[j + 1] = nums[j + 1], nums[j]
print("Sorted:", nums)
`,
  },

  // --- PYTHON ERRORS ---
  {
    id: 'py-error-index',
    language: 'python',
    title: 'Index Error',
    category: 'Errors',
    description: 'Out of range subscript access with state note',
    code: `arr = [3, 8, 1, 9, 4]
index = 5
total = 10
total += arr[index]
`,
  },
  {
    id: 'py-error-zerodiv',
    language: 'python',
    title: 'Zero Division',
    category: 'Errors',
    description: 'Division by zero exception snapshot',
    code: `numerator = 100
denominator = 0
result = numerator / denominator
`,
  },

  // --- C EXAMPLES ---
  {
    id: 'c-swap',
    language: 'c',
    title: 'Pointer Swap',
    category: 'Basics',
    description: 'Pass-by-pointer and memory manipulation',
    code: `#include <stdio.h>

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
`,
  },
  {
    id: 'c-arrays',
    language: 'c',
    title: 'Array Sum',
    category: 'Structures',
    description: 'Fixed-size array indexing in C',
    code: `#include <stdio.h>

int main() {
    int arr[5] = {10, 20, 30, 40, 50};
    int sum = 0;
    for (int i = 0; i < 5; i++) {
        sum += arr[i];
    }
    printf("Sum: %d\\n", sum);
    return 0;
}
`,
  },
  {
    id: 'c-out-of-bounds',
    language: 'c',
    title: 'Out of Bounds Error',
    category: 'Errors',
    description: 'Array bounds violation detected by Tracel',
    code: `#include <stdio.h>

int main() {
    int arr[5] = {1, 2, 3, 4, 5};
    arr[5] = 99; // Error: index 5 out of bounds for size 5
    return 0;
}
`,
  },

  // --- C++ EXAMPLES ---
  {
    id: 'cpp-stl',
    language: 'cpp',
    title: 'STL Containers',
    category: 'Structures',
    description: 'std::vector, std::stack, and std::queue',
    code: `#include <iostream>
#include <vector>
#include <stack>
#include <queue>
using namespace std;

int main() {
    vector<int> v = {5, 2, 9};
    v.push_back(1);

    stack<int> s;
    s.push(10);
    s.push(20);
    s.pop();

    queue<string> q;
    q.push("A");
    q.push("B");
    q.pop();

    cout << v.size() << endl;
    return 0;
}
`,
  },
  {
    id: 'cpp-linkedlist',
    language: 'cpp',
    title: 'Node with Pointers',
    category: 'Structures',
    description: 'Linked list nodes with new and delete',
    code: `#include <iostream>
using namespace std;

struct Node {
    int val;
    Node* next;
};

int main() {
    Node* n1 = new Node{1, nullptr};
    Node* n2 = new Node{2, nullptr};
    n1->next = n2;

    cout << n1->val << " -> " << n1->next->val << endl;
    delete n2;
    delete n1;
    return 0;
}
`,
  },
];

export function getExamplesForLanguage(lang: 'python' | 'c' | 'cpp'): Example[] {
  return EXAMPLES.filter((e) => e.language === lang);
}

export function getDefaultExample(lang: 'python' | 'c' | 'cpp'): Example {
  const match = EXAMPLES.find((e) => e.language === lang);
  return match || EXAMPLES[0]!;
}


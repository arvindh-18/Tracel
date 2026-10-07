export interface Example {
  id: string;
  language: 'python' | 'c' | 'cpp';
  title: string;
  category: 'Basics' | 'Data structures' | 'Algorithms' | 'Errors';
  code: string;
}

export const EXAMPLES: Example[] = [
  {
    id: 'py-variables',
    language: 'python',
    title: 'Variables',
    category: 'Basics',
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
    code: `def add(a, b):
    return a + b

result = add(10, 20)
print(result)
`,
  },
  {
    id: 'py-recursion',
    language: 'python',
    title: 'Recursion (factorial)',
    category: 'Basics',
    code: `def fact(n):
    if n <= 1:
        return 1
    return n * fact(n - 1)

print(fact(4))
`,
  },

  {
    id: 'py-arrays',
    language: 'python',
    title: 'Array mutation',
    category: 'Data structures',
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
    category: 'Data structures',
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
    category: 'Data structures',
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
    title: 'Linked list',
    category: 'Data structures',
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
    title: 'Object aliasing',
    category: 'Data structures',
    code: `a = [1, 2]
b = a
b.append(3)
print("a is:", a)
`,
  },

  {
    id: 'py-bubble-sort',
    language: 'python',
    title: 'Bubble sort',
    category: 'Algorithms',
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

  {
    id: 'py-error-index',
    language: 'python',
    title: 'Index error',
    category: 'Errors',
    code: `arr = [3, 8, 1, 9, 4]
index = 5
total = 10
total += arr[index]
`,
  },
  {
    id: 'py-error-zerodiv',
    language: 'python',
    title: 'Division by zero',
    category: 'Errors',
    code: `numerator = 100
denominator = 0
result = numerator / denominator
`,
  },

  {
    id: 'c-swap',
    language: 'c',
    title: 'Pointer swap',
    category: 'Basics',
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
    title: 'Array sum',
    category: 'Data structures',
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
    title: 'Out-of-bounds write',
    category: 'Errors',
    code: `#include <stdio.h>

int main() {
    int arr[5] = {1, 2, 3, 4, 5};
    arr[5] = 99; // Error: index 5 out of bounds for size 5
    return 0;
}
`,
  },

  {
    id: 'cpp-stl',
    language: 'cpp',
    title: 'STL containers',
    category: 'Data structures',
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
    title: 'Linked list with pointers',
    category: 'Data structures',
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


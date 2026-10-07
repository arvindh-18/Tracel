// Section 4 of docs/reference/motion/REFERENCE.md: one program per reference panel.
// `at` is the fraction of the trace to capture, chosen to land mid-operation.
export const PROGRAMS = [
  {
    id: '01-array-scan', lang: 'C', at: 0.55,
    code: `int main() {
    int a[5];
    a[0] = 3; a[1] = 7; a[2] = 1; a[3] = 9; a[4] = 4;
    int best = 0;
    for (int i = 0; i < 5; i++) {
        if (a[i] > best) best = a[i];
    }
    return 0;
}
`,
  },
  {
    id: '02-linked-list', lang: 'C++', at: 0.8,
    code: `struct Node {
    int val;
    Node* next;
};

int main() {
    Node* head = new Node{3, nullptr};
    head->next = new Node{7, nullptr};
    head->next->next = new Node{9, nullptr};
    Node* curr = head;
    while (curr != nullptr) {
        curr = curr->next;
    }
    return 0;
}
`,
  },
  {
    id: '03-stack', lang: 'C++', at: 0.75,
    code: `#include <stack>
using namespace std;

int main() {
    stack<int> s;
    s.push(3);
    s.push(7);
    s.push(5);
    s.pop();
    s.push(9);
    s.pop();
    return 0;
}
`,
  },
  {
    id: '06-queue', lang: 'C++', at: 0.7,
    code: `#include <queue>
using namespace std;

int main() {
    queue<int> q;
    q.push(7);
    q.push(9);
    q.push(6);
    q.pop();
    q.push(8);
    q.pop();
    return 0;
}
`,
  },
];

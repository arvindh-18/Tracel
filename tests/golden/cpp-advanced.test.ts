import { describe, expect, it } from 'vitest';
import { runClikeInterpreter } from '../../src/engine/adapters/clike/interpreter';
import { normalize } from '../../src/trace/normalize';

const HEADER = '#include <bits/stdc++.h>\nusing namespace std;\n';
function run(body: string, stdin?: string) {
  const raw = runClikeInterpreter(HEADER + body, { stdin, stepLimit: 20000 });
  if (raw.status !== 'completed') throw new Error(`${raw.error?.kind} on line ${raw.error?.line}: ${raw.error?.message}`);
  return normalize(raw);
}

describe('Advanced C++', () => {
  it('function and class templates, with explicit template arguments', () => {
    const t = run(`
template <typename T>
T biggest(const vector<T>& v) {
    T best = v[0];
    for (const T& x : v) if (x > best) best = x;
    return best;
}
template <class T>
class Box {
    T value;
public:
    Box(T v) : value(v) {}
    T get() const { return value; }
};
int main() {
    vector<int> a = {3, 9, 2};
    vector<string> s = {"pear", "apple", "zoo"};
    Box<double> b(2.5);
    cout << biggest(a) << " " << biggest<string>(s) << " " << b.get() << endl;
}
`);
    expect(t.stdout).toBe('9 zoo 2.5\n');
  });

  it('inheritance, virtual overrides, base constructors, Base::method and destructor chains', () => {
    const t = run(`
class Shape {
protected:
    string name;
public:
    Shape(string n) : name(n) {}
    virtual double area() const = 0;
    virtual string describe() const { return name + " " + to_string((int)area()); }
    virtual ~Shape() { cout << "~Shape "; }
};
class Rect : public Shape {
    double w, h;
public:
    Rect(double w, double h) : Shape("rect"), w(w), h(h) {}
    double area() const override { return w * h; }
};
class Square : public Rect {
public:
    Square(double s) : Rect(s, s) {}
    string describe() const override { return "square:" + Rect::describe(); }
    ~Square() { cout << "~Square "; }
};
int main() {
    vector<Shape*> shapes = {new Rect(2, 3), new Square(4)};
    for (Shape* s : shapes) cout << s->describe() << endl;
    delete shapes[1];
    cout << endl;
}
`);
    expect(t.stdout).toBe('rect 6\nsquare:rect 16\n~Square ~Shape \n');
  });

  it('enums and enum classes', () => {
    const t = run(`
enum Color { RED, GREEN = 5, BLUE };
enum class Dir { Up, Down, Left, Right };
int main() {
    Color c = BLUE;
    Dir d = Dir::Left;
    if (d == Dir::Left) cout << c << " " << (int)Dir::Right << endl;
}
`);
    expect(t.stdout).toBe('6 3\n');
  });

  it('exceptions: throw, catch by base class, catch (...), rethrow, at() and stoi', () => {
    const t = run(`
class InsufficientFunds : public runtime_error {
public:
    InsufficientFunds(string msg) : runtime_error(msg) {}
};
void withdraw(int balance, int amount) {
    if (amount > balance) throw InsufficientFunds("need " + to_string(amount - balance) + " more");
}
int main() {
    try {
        withdraw(10, 25);
    } catch (const exception& e) {
        cout << "caught: " << e.what() << endl;
    }
    vector<int> v = {1, 2};
    try { v.at(5); } catch (out_of_range& e) { cout << "range" << endl; }
    try { stoi("abc"); } catch (invalid_argument& e) { cout << "bad number" << endl; }
    try { throw 42; } catch (int code) { cout << "code " << code << endl; }
    try {
        try { throw string("inner"); } catch (...) { cout << "rethrowing "; throw; }
    } catch (string s) { cout << s << endl; }
}
`);
    expect(t.stdout).toBe('caught: need 15 more\nrange\nbad number\ncode 42\nrethrowing inner\n');
  });

  it('an uncaught exception stops the program on the throw line', () => {
    const raw = runClikeInterpreter(HEADER + 'int main() {\n    vector<int> v;\n    throw runtime_error("boom");\n}\n');
    expect(raw.status).toBe('error');
    expect(raw.error).toMatchObject({ kind: 'UncaughtException', line: 5 });
    expect(raw.error?.message).toContain('runtime_error("boom")');
  });

  it('static members, static methods, namespaces, unions and bit-fields', () => {
    const t = run(`
namespace geo {
    struct Point { int x, y; };
    int manhattan(Point a, Point b) { return abs(a.x - b.x) + abs(a.y - b.y); }
}
class Counter {
public:
    static int created;
    Counter() { created++; }
    static int total() { return created; }
};
int Counter::created = 0;
union Value { int i; double d; };
struct Flags { unsigned int ready : 1; unsigned int level : 3; };
int main() {
    Counter a, b, c;
    geo::Point p{1, 2}, q{4, 6};
    Value v;
    v.i = 7;
    Flags f;
    f.ready = 3;
    f.level = 13;
    cout << Counter::total() << " " << a.created << " " << geo::manhattan(p, q) << " " << v.d << " " << f.ready << f.level << endl;
}
`);
    expect(t.stdout).toBe('3 3 7 7 15\n');
  });

  it('goto within a function', () => {
    const t = run(`
int main() {
    int i = 0;
again:
    i++;
    if (i < 3) goto again;
    cout << i << endl;
}
`);
    expect(t.stdout).toBe('3\n');
  });

  it('operator overloading, friend operator<<, and function-object comparators', () => {
    const t = run(`
struct Vec {
    int x, y;
    Vec operator+(const Vec& o) const { return {x + o.x, y + o.y}; }
    bool operator==(const Vec& o) const { return x == o.x && y == o.y; }
    bool operator<(const Vec& o) const { return x < o.x || (x == o.x && y < o.y); }
    friend ostream& operator<<(ostream& os, const Vec& v) { os << "(" << v.x << "," << v.y << ")"; return os; }
};
struct ByDistance {
    bool operator()(const Vec& a, const Vec& b) const { return a.x * a.x + a.y * a.y > b.x * b.x + b.y * b.y; }
};
int main() {
    Vec a{1, 2}, b{3, 4};
    Vec c = a + b;
    cout << c << " " << (c == Vec{4, 6}) << " " << (a != b) << endl;
    vector<Vec> pts = {{3, 1}, {1, 5}, {1, 2}};
    sort(pts.begin(), pts.end());
    for (auto& p : pts) cout << p;
    cout << endl;
    priority_queue<Vec, vector<Vec>, ByDistance> pq;
    for (auto& p : pts) pq.push(p);
    cout << pq.top() << endl;
}
`);
    expect(t.stdout).toBe('(4,6) 1 1\n(1,2)(1,5)(3,1)\n(1,2)\n');
  });

  it('multiset, multimap, stringstream, next_permutation, unique and count_if', () => {
    const t = run(`
int main() {
    multiset<int> ms = {3, 1, 3, 2};
    multimap<string, int> scores;
    scores.insert({"amy", 5});
    scores.insert({"amy", 7});
    scores.insert({"bob", 1});
    cout << ms.count(3) << " " << *ms.begin() << " " << scores.count("amy") << endl;
    stringstream ss("10,20,30");
    string token;
    int sum = 0;
    while (getline(ss, token, ',')) sum += stoi(token);
    istringstream words("the quick fox");
    string w;
    int n = 0;
    while (words >> w) n++;
    ostringstream out;
    out << "sum=" << sum << " words=" << n;
    cout << out.str() << endl;
    vector<int> p = {1, 2, 3};
    int perms = 1;
    while (next_permutation(p.begin(), p.end())) perms++;
    vector<int> d = {1, 1, 2, 2, 2, 3};
    d.erase(unique(d.begin(), d.end()), d.end());
    int evens = count_if(d.begin(), d.end(), [](int x) { return x % 2 == 0; });
    cout << perms << " " << d.size() << " " << evens << " " << numeric_limits<int>::max() << endl;
}
`);
    expect(t.stdout).toBe('2 1 2\nsum=60 words=3\n6 3 1 2147483647\n');
  });

  it('while (cin >> x) stops at the end of input, and getline reads whole lines', () => {
    const t = run(
      `
int main() {
    string first;
    getline(cin, first);
    int x, total = 0;
    while (cin >> x) total += x;
    cout << first << ": " << total << endl;
}
`,
      'Total of numbers\n4 5\n6'
    );
    expect(t.stdout).toBe('Total of numbers: 15\n');
  });
});

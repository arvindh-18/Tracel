# Tracel

Tracel runs a Python, C or C++ program in your browser and lets you step through it line by line while it draws the call frames, variables, pointers and data structures (arrays, 2-D grids, stacks, queues, linked lists, trees, dicts, objects) at each step.

It is a static site: no server, no database, no account. Your code runs in your own browser. AI explanations are optional and use your own free Gemini key.

![Tracel in the light theme](docs/screenshots/light.png)
![Tracel in the dark theme](docs/screenshots/dark.png)

## Running it

Requires Node.js 18 or later.

```bash
npm install
npm run dev              # development server on http://localhost:5173
npm test                 # unit and golden tests (the Python tracer tests need python3 3.12)
npx tsc --noEmit         # type-check
npm run build            # static site in dist/
npx vite preview         # serve the build locally
npm run gen:examples     # regenerate the prebuilt example traces (see below)
npm run check:contrast   # WCAG contrast check for both themes
```

`node scripts/capture-screenshots.js` serves the last build and captures every viewport in both themes into `qa-screenshots/`.

## Languages and limits

**Python** runs real CPython 3.12 (Pyodide, loaded from the jsDelivr CDN the first time you run edited Python code) in a Web Worker, traced with `sys.settrace`. Your program may import only `math`, `random` (seeded with 0), `collections`, `heapq`, `bisect`, `itertools`, `functools`, `operator`, `string`, `re`, `dataclasses`, `typing`, `enum`, `copy`, `statistics`, `fractions`, `decimal`, `array`, `time` and the `tracel` helper module (`tracel.Stack`, `tracel.Queue`); anything else raises an `ImportError`. After Pyodide loads, the worker removes `fetch`, `XMLHttpRequest`, `WebSocket`, `EventSource` and `importScripts`. Objects reachable from your variables are drawn to a depth of 6, up to 300 objects and 100 items per container.

**C and C++** run on Tracel's own deterministic interpreter (`src/engine/adapters/clike`: a tokenizer, a recursive-descent parser and a tree-walking evaluator) in a Web Worker. No AI is involved in running code. The supported subset:

- **Types:** `char`, `bool`, `short`, `int`, `long`, `long long`, `unsigned` variants, `float`, `double`, `size_t`. `int` wraps at 32 bits; `long`/`long long` are exact 64-bit values (BigInt); integer division truncates; `%` keeps the sign of the left operand.
- **Expressions and statements:** arithmetic, comparison, logical, bitwise and compound-assignment operators, prefix/postfix `++`/`--`, ternary, `sizeof`, casts; `if`/`else`, `while`, `do`/`while`, `for`, range-`for`, `break`, `continue`, `switch`/`case`; block scopes with shadowing.
- **Functions:** recursion, pass by value, pointers and C++ references; call-stack depth limit 256.
- **Memory:** 1-D and 2-D arrays with initializer lists; pointers, `&`, `*`, `->`, pointer arithmetic, array decay, `NULL`/`nullptr`; `malloc`/`calloc`/`free`, `new`/`new[]`/`delete`/`delete[]`.
- **Structs and classes:** fields, member functions (inline or `Type Class::f()` out of line), constructors with initializer lists, destructors (run by `delete`, from the derived class to its bases), `this`, `static` members and functions, single and multiple inheritance with `virtual` overrides (dispatched on the object's real class), pure virtual functions, `Base::method()` calls, operator overloading (`operator<`, `==`, `+`, `operator()` for comparators…) and `friend` functions such as `operator<<`, structs holding pointers (linked lists, trees), unions (members share one slot; reading another member shows the converted value, not reinterpreted bits) and bit-fields.
- **Templates and more:** function and class templates (type parameters behave as "any type"; explicit arguments like `f<int>(x)` work), `enum` and `enum class`, `namespace`, `try`/`catch`/`throw` with the standard exception classes (`at()` and `stoi` throw `out_of_range`/`invalid_argument`), and `goto` to a label in the same or an enclosing block.
- **I/O:** `printf` (`%d %i %u %ld %lld %f %.Nf %e %g %c %s %p %x %X %o %%`, width, precision and flags), `scanf`, `puts`, `putchar`, `std::cout`/`std::cin`/`std::endl` (`while (cin >> x)` stops at the end of input), `getline` (lines, or up to a delimiter), `stringstream`/`istringstream`/`ostringstream`, `fixed`/`setprecision`. Input comes from the Input box.
- **Library:** `std::vector` (`push_back`, `pop_back`, `[]`, `at`, `insert`, `erase`, `assign`, `resize`, `front`, `back`, `begin`/`end`), `std::map`/`std::unordered_map` (`[]`, `at`, `count`, `contains`, `find`, `insert`, `emplace`, `erase`, iterators with `->first`/`->second`), `std::set`/`std::unordered_set`, `std::multiset`/`std::multimap`, `std::priority_queue` (with `greater<T>` or a comparator; kept as a real binary heap), `std::stack`, `std::queue`, `std::deque`, `std::pair`/`make_pair`, `std::string` (indexing and changing characters, `substr`, `find`, `push_back`, `pop_back`, `append`, `insert`, `erase`), `sort`/`stable_sort`/`reverse` (with comparators), `next_permutation`/`prev_permutation`, `unique`, `count_if`/`find_if`/`any_of`/`all_of`/`none_of`, `numeric_limits<T>::max()`/`min()`, `__builtin_popcount`, `max_element`, `min_element`, `accumulate`, `count`, `find`, `lower_bound`, `upper_bound`, `binary_search`, `fill`, `iota`, `swap`, `max`/`min` (including `max({a, b, c})`), `gcd`, `memset`, `stoi`, `to_string`, `isdigit`/`isalpha`/`tolower`/`toupper`, `abs`, `sqrt`, `pow`, `strlen`, `rand`/`srand`.
- **Modern C++:** `auto`, range-`for` (over containers, maps, strings and `{...}` lists), structured bindings (`auto [k, v]`, `for (auto& [k, v] : m)`), lambdas (captures behave as by reference) and `std::function` for recursive lambdas, `using` aliases, temporaries like `vector<int>(n, 0)`, and `return {a, b};`.
- **LeetCode:** use LeetCode mode (below) to run a bare `class Solution`, or add your own `main()`. Containers held inside an object (for example a `MinStack`'s member stacks) get their own card.
- **Headers:** `stdio.h`, `stdlib.h`, `string.h`, `math.h`, `stdbool.h`, `limits.h`, `stddef.h`, `stdint.h`, `ctype.h`, `time.h`, `assert.h`, `iostream`, `vector`, `stack`, `queue`, `deque`, `map`, `unordered_map`, `set`, `unordered_set`, `string`, `algorithm`, `numeric`, `functional`, `utility`, `cmath`, `cstdio`, `cstdlib`, `cstring`, `cctype`, `climits`, `cstddef`, `cstdint`, `cassert`, `iomanip`, `bits/stdc++.h`.

Out-of-bounds access, null dereference, use-after-free, dangling pointers, double free, uninitialized reads, division by zero, popping an empty container, runaway recursion and uncaught exceptions stop the run on the exact line, with a plain-language explanation and the variables involved. The only things rejected before running are inline assembly (machine code the interpreter doesn't model), `#include "file.h"` (Tracel runs a single file) and headers it doesn't provide (such as `<regex>`). Access specifiers (`public`/`private`) are accepted but not enforced, destructors run only on `delete` (not when a local object goes out of scope), lambda captures behave as by reference, and template type parameters aren't checked.

**Limits:** every run stops after 5,000 steps by default (up to 20,000 in Settings), and a watchdog stops any run that takes more than 8 seconds. **Stop** cancels a run immediately: it terminates the worker (a fresh one starts next time) and aborts any AI request.

## LeetCode mode

Turn on **LeetCode** in the top bar (C++ and Python). The editor then holds only a `class Solution`, exactly as you'd write it on LeetCode, and a **Test case** box replaces the input box. Type the arguments either the way the problem statement shows them (`nums = [2,7,11,15], target = 9`) or one per line like LeetCode's test-case box. If the class has several public methods, pick the one to run.

When you press Run, Tracel wraps your class in a hidden runner: it adds the usual headers or imports, `ListNode` and `TreeNode` (unless you define them), builds the arguments from the test case (lists as `vector`/`list`, `[1,2,3]` as a linked list, `[3,9,20,null,null,15,7]` as a tree level by level), calls your method and prints `Output: ...` in LeetCode's format; a `void` method prints its first argument after the call, for in-place problems. The trace shows only your own lines: the runner appears as a "LeetCode runner" frame holding the arguments, and errors point at your code. Each mode keeps its own code, and the Examples menu lists LeetCode problems while the mode is on. Share links remember the mode and the test case.

## AI features (optional, your own key)

Everything above works with no key. To add AI, open **Settings → AI**, paste a free key from [Google AI Studio](https://aistudio.google.com/apikey), and Tracel will:

- **Explain steps:** after a run, write a short "why" sentence for each step in the timeline, plus a 2–3 sentence overview of the program. Narration replaces the built-in text only when Gemini returns exactly one sentence per step; the trace itself (values, state, step count) always comes from the real engine.
- **Explain this error:** a button on the error card that sends the code, the error and the variables involved, and shows a plain explanation with a suggested fix. The fix is never applied for you.
- **Simulate with AI (may be inaccurate):** offered when the C++ interpreter rejects a program (now rare). Gemini returns small operations per executed line (call, return, declare, assign, alloc, free, write, push/pop, print, error…), which Tracel validates and replays on its own memory model. The trace stops with an error on any impossible operation instead of guessing. These traces are labelled **AI-simulated** and capped at 500 steps by default.

**Privacy:** the key is stored only in your browser's localStorage (Settings has **Forget key**). It is never logged, never put in a URL and never sent anywhere except Google's API. Requests go directly from your browser to Google under your own key and Google's terms, so don't paste private code. Responses are cached in your browser's IndexedDB, so repeating a request costs nothing. Running out of free quota, a rejected key, network failures and timeouts show a notice; the rest of the app keeps working. You can choose the model in Settings (Gemini 3.8 Flash by default, or 3.5 Flash-Lite).

## Prebuilt examples and share links

Every built-in example ships with its trace in `public/examples/<id>.json`, so opening one is instant and needs no engine (not even Pyodide) and no API call. Editing the code switches to a live run. After changing an example in `src/features/examples/registry.ts`, or the trace format, run:

```bash
npm run gen:examples                      # real engines only
GEMINI_API_KEY=your-key npm run gen:examples   # also bake in AI explanations
```

C/C++ examples run on the interpreter; Python examples run the same tracer in Pyodide for Node (the `pyodide` npm package, pinned to the CDN version the site loads). A test fails if an example's JSON is missing or stale.

The share button copies a link with the language, code and input compressed into the URL hash (lz-string). Opening it restores the program. Nothing is uploaded.

## Deploying

`npm run build` produces a static site in `dist/`. To serve it from a subpath, set `BASE_PATH`, for example `BASE_PATH=Tracel npm run build` for `https://<user>.github.io/Tracel/`.

- **GitHub Pages:** `.github/workflows/ci.yml` type-checks, tests and builds on every push, and deploys `main` to Pages with `BASE_PATH` set to the repository name. In the repository settings, set Pages → Source to "GitHub Actions".
- **Cloudflare Pages / Netlify:** build command `npm run build`, output directory `dist`. Both serve from the domain root, so leave `BASE_PATH` unset. No environment variables are needed.

`index.html` sets a Content-Security-Policy that allows scripts only from the site and jsDelivr (Pyodide), and network requests only to the site, jsDelivr and `generativelanguage.googleapis.com` (Gemini).

## Keyboard shortcuts

| Action | Keys |
|---|---|
| Run | ⌘ Enter / Ctrl Enter |
| Play or pause | Space, or ⌘ . / Ctrl . |
| Step forward / back | → / ← (outside the editor), F10 / Shift F10 |
| First / last step | Home / End |
| Restart | R |
| Playback speed | 1 to 5 |
| Toggle breakpoint | F9 |
| Shortcut list | ? |

## Themes

Light, dark, or follow the system setting, chosen from the top bar or Settings. All colors are tokens in `src/styles/tokens.css`; components never use raw colors.

## Architecture

See [ARCHITECTURE.md](ARCHITECTURE.md). Examples live in `src/features/examples/registry.ts`; new languages implement `LanguageAdapter` in `src/engine/adapters/types.ts`.

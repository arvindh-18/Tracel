# Tracel — See your code come alive.

**Tracel** is a premium program-execution visualization environment for developers and learners. It lets you write Python, C, or C++ code, run it, and watch execution unfold step-by-step:
- Follow the execution light as it travels through lines and loops
- Inspect call stack frames with their local variables
- Watch data structures (arrays, stacks, queues, linked lists, trees, dicts, objects) mutate with physical animations
- Travel backward and forward in time across an interactive execution timeline

Tracel is **not** an online compiler, **not** a basic code editor with a console, and **not** an AI assistant. There are no AI chatbots, sparkles, or neural glow effects. Its intelligence comes directly from precise program analysis and physical visualization.

---

## Supported Languages & Runtimes

### 1. Python
- **Runtime:** Real CPython compiled to WebAssembly via **Pyodide** running inside a dedicated Web Worker.
- **Tracing:** `sys.settrace` hook capturing statement boundaries, line events, call/return frames, and AST construct metadata (`if`, `for`, `while`).
- **Sandbox:** Import allowlist includes `math`, `random` (seeded 0), `collections`, `heapq`, `bisect`, `itertools`, `functools`, `string`, `typing`, `dataclasses`, and the custom `tracel` helper module (`tracel.Stack`, `tracel.Queue`).
- **Limits:** 5,000 steps execution cap (configurable up to 20,000), 8-second watchdog timeout.

### 2. C and C++
- **Runtime:** Tracel's own typed AST interpreter executing real C/C++ semantics inside a Web Worker.
- **Memory Model:** Typed block allocation model (`Block { id, region, elemType, elements, address }`) with synthetic 32-bit/64-bit address spaces.
- **Safety Checks:** Out-of-bounds indexing, null pointer dereferences, use-after-free, double free, and uninitialized variable reads are detected and reported with exact line pointers.
- **STL / Standard Library:** `<stdio.h>` (`printf`, `scanf`), `std::cout`, `std::cin`, `std::vector`, `std::stack`, `std::queue`, `malloc`/`free`, `new`/`delete`.
- **Honest Subsets:** Unsupported features (e.g. user-defined `template<typename T>`, multiple compilation units) are rejected upfront with line-anchored explanations.

---

## Getting Started

### Prerequisites
- Node.js (v18+)
- npm

### Installation & Development
```bash
# Install dependencies
npm install

# Start local development server
npm run dev

# Run unit and golden test suite
npm test

# Build production bundle
npm run build
```

---

## Design System & Motion

Tracel features a calm, technical dark theme built on design tokens:
- **Surfaces:** `--bg-0 #0A0C0F` through `--bg-4 #242A35`
- **Execution Accent:** `--exec #FFB547` (warm amber execution light)
- **Semantic Colors:** `--sem-create #6FD3A0`, `--sem-update #FFB547`, `--sem-remove #F0817A`, `--sem-ref #7CB4FF`, `--sem-call #B9A6FF`
- **Typography:** Geist (UI), JetBrains Mono (code and runtime values)
- **Motion:** Speed-aware Framer Motion tokens (`instant`, `fast`, `base`, `slow`, `tint`), with strict support for `prefers-reduced-motion: reduce`.

---

## Keyboard Shortcuts

| Action | Shortcut |
|---|---|
| **Run / Retrace** | `⌘ / Ctrl + Enter` |
| **Play / Pause** | `Space` (outside editor) or `⌘/Ctrl + .` |
| **Step Forward** | `→` (outside editor) or `F10` |
| **Step Backward** | `←` (outside editor) or `Shift + F10` |
| **First / Last Step** | `Home` / `End` |
| **Restart Trace** | `R` |
| **Playback Speed** | `1` (0.5×) · `2` (1×) · `3` (1.5×) · `4` (2×) · `5` (4×) |
| **Toggle Breakpoint** | `F9` on current cursor line |
| **Keyboard Shortcuts Help** | `?` |

---

## Adding Examples & Adapters

### Adding an Example Program
Add an entry in `src/features/examples/registry.ts`:
```ts
{
  id: 'py-custom',
  language: 'python',
  title: 'My Custom Algorithm',
  category: 'Algorithms',
  description: 'Short summary of the algorithm',
  code: `...`,
}
```

### Adding a Language Adapter
Implement the `LanguageAdapter` interface in `src/engine/adapters/types.ts` and register it in `src/engine/host.ts`:
```ts
export interface LanguageAdapter {
  id: string;
  displayName: string;
  engineLabel: string;
  fileExtension: string;
  prepare(): Promise<void>;
  run(req: RunRequest, onProgress?: (steps: number) => void): Promise<RawTrace>;
  supportInfo: SupportInfo;
}
```
The visualization layer consumes only normalized `Trace` and `Step` models, ensuring new language backends integrate seamlessly without modifying UI components.


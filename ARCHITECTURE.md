# Tracel Architecture Specification

This document details the architectural principles, data flow, invertibility guarantees, security posture, and motion choreography of **Tracel**.

---

## 1. High-Level Pipeline

Tracel is a static site. There is no backend: every engine runs in the visitor's browser, and the only optional network service is Google Gemini, called directly with the visitor's own key.

```
SOURCE CODE (Python, C, C++)
       │
       ├─ unchanged built-in example? ──► public/examples/<id>.json (prebuilt Trace) ──┐
       ▼                                                                                │
LANGUAGE ADAPTER  (LanguageAdapter.run → RawTrace: a full snapshot per step)            │
  ├─ Python: Web Worker + Pyodide (CPython 3.12 WASM) + sys.settrace tracer             │
  └─ C / C++: Web Worker + Tracel interpreter (src/engine/adapters/clike)               │
       lexer.ts → parser.ts (recursive descent → AST) → interpreter.ts                  │
       (tree-walking evaluator over typed memory blocks with safety checks)             │
       │                                                                                │
       ▼ RawTrace (snapshots, stdout, status, error)                                    │
TRACE CORE (language-agnostic)                                                          │
  ├─ normalize: heap versions with structural sharing, stable HeapIds                   │
  ├─ diff: variable, call/return and container events (set, push, pop, swap, enqueue…)  │
  ├─ lens-infer: comment pragmas, container types, grid/list/tree shape, name heuristics│
  └─ narrate: deterministic sentence per step                                           │
       │                                                                                │
       ▼ Trace ◄────────────────────────────────────────────────────────────────────────┘
OPTIONAL AI LAYER (only with a key saved in Settings; src/engine/adapters/ai)
  ├─ explain: digest of the real trace → per-step narration, overview, lens hints
  │           (merged only where they fit; never changes state)
  ├─ explain error: code + error + variables → explanation and suggested fix
  └─ simulate (unsupported C++ only, on request): ops per line → zod → replay.ts → RawTrace,
     labelled AI-simulated
     All calls: browser → generativelanguage.googleapis.com, structured JSON output,
     one validation retry, IndexedDB cache keyed by SHA-256(model, feature, language, source, stdin)
       │
       ▼
STATE MODEL (Zustand: session + playback + prefs + toasts)
       │ stateAt(step) → ViewState { frames, heap, output, events }
       ▼
VISUALIZATION
  ├─ CodeMirror 6 editor with the execution line
  ├─ Lens: Frames, Array, Grid, Stack, Queue, LinkedList, Dict, Object views. Pointers show as
  │  markers on the array cells and list nodes they target; freed blocks are drawn as freed
  └─ Timeline dock: transport, scrubber, speed
```

### C/C++ interpreter

Every variable lives in a block. A scalar is a one-slot block, an array is an n-slot block (a 2-D array is an array of row blocks), a struct or class object keeps named fields, and `std::vector`/`std::stack`/`std::queue` keep their items. A pointer is a (block, offset) pair, so `&x`, array decay, pointer arithmetic, `malloc` and `new` share one model. All reads and writes go through `read`/`write`, which check bounds, null, freed blocks, blocks whose scope has ended, and uninitialized values. A failed check stops the run with a `TraceError` on the current line, including a title, an explanation and the variables involved. `int` arithmetic wraps at 32 bits; `long`/`long long` use BigInt. Each executed statement records one step with its line and source range; calls and returns record frames with locals in declaration order; branches and loop iterations add explicit events for the narration.

### AI simulation contract

The model never sends whole snapshots. Each step is `{ line, narration, ops[] }`, where an op is one of `call`, `return`, `declare`, `assign`, `alloc`, `free`, `write`, `push`, `pop`, `enqueue`, `dequeue`, `push_back`, `pop_back`, `print`, `read_input` or `error`. Values use one flat shape, `{ k, v?, id?, offset?, t? }`, because Gemini rejects deeply nested schemas. The schema is in `src/engine/adapters/ai/schema.ts`; the prompt, with two worked examples, is in `prompts.ts`.

`replay.ts` is deterministic. It owns all state, applies the operations in order and records a snapshot after each step. Pointers become `{ k: 'ptr', id, offset, t, address }`, where `id` names a block or, for `&x`, the variable. Every operation is checked for bounds, use-after-free, double free and empty containers. An impossible operation ends the trace with an `InvalidAiTrace` error at that line, rather than inventing state. The replayer has its own small memory model; it does not share the interpreter's.

## 2. Normalized Trace Schema & Invertibility

The core model in `src/trace/schema.ts` provides total language independence:
```ts
type Value =
  | Primitive // { k: 'int' | 'float' | 'bool' | 'str' | 'char' | 'none' | 'uninit' | 'fn' }
  | { k: 'ref'; id: HeapId }
  | { k: 'ptr'; id: HeapId | null; offset: number; t: string; address: string }
  | { k: 'inline'; id: HeapId };

interface HeapObject {
  id: HeapId;
  kind: HeapKind; // 'list' | 'tuple' | 'dict' | 'set' | 'deque' | 'instance' | 'array' | ...
  typeName: string;
  region: 'heap' | 'stack' | 'static';
  address?: string;
  items?: Value[];
  entries?: [Value, Value][];
  fields?: [string, Value][];
  freed?: boolean;
  version: number;
}
```

### Exact State Reconstruction: `stateAt(trace, stepIndex)`
- Forward stepping, backward stepping, and scrubbing are non-destructive.
- The trace stores `heapVersions: Record<HeapId, HeapObject[]>`. A step references only `{ [heapId]: version }`.
- When an object undergoes mutation, a new version is appended. Unchanged objects share identical version indices across consecutive steps.
- Output is stored as a single cumulative string `trace.stdout`; step $k$ accesses `trace.stdout.slice(0, step.stdoutLength)`. Stepping backward automatically un-prints stdout without string rebuilding.
- An LRU cache preserves reconstructed `ViewState` instances for immediate responsiveness during scrubbing.

---

## 3. Language Adapter Contract

New languages implement `LanguageAdapter` in `src/engine/adapters/types.ts`:
```ts
interface LanguageAdapter {
  id: 'python' | 'c' | 'cpp';
  displayName: string;
  engineLabel: string;
  fileExtension: string;
  prepare(): Promise<void>;
  run(req: RunRequest, onProgress?: (stepCount: number) => void): Promise<RawTrace>;
  cancel?(): void; // abandon the run in progress; its promise rejects with RunCancelled
  supportInfo: SupportInfo;
}
```
Adapters are registered with `engineHost` (`src/engine/host.ts`). The UI and Lens visualizers never import language-specific code.

---

## 4. Security, Privacy and Limits

1. **Client-side execution:** Python and C/C++ each run in a Web Worker in the visitor's browser. No code is executed on a server, and there is no server.
2. **Pyodide sandbox:**
   - After Pyodide loads, `fetch`, `XMLHttpRequest`, `WebSocket`, `EventSource` and `importScripts` are removed from the worker scope.
   - An import hook allows only the modules listed in the README, for imports made by the user's program (identified by its globals dict); anything else, including `os`, `sys`, `subprocess` and `socket`, raises an `ImportError`.
   - The security boundary is the browser's WebAssembly sandbox; the import hook adds defense in depth and a clear message.
3. **Limits and cancel:**
   - Step limit: 5,000 by default (up to 20,000) gives a clean partial trace that ends in a limit error.
   - Watchdog: the main thread terminates a worker after 8 seconds and starts a fresh one on the next run.
   - Stop terminates the worker immediately and aborts any in-flight AI request with an AbortController; the late result is ignored.
4. **AI and the API key:** the visitor's Gemini key is kept in localStorage only. It is sent only to `generativelanguage.googleapis.com`, never logged and never placed in a URL. With no key, Tracel makes no AI requests. Prompts contain the source, stdin and, for explanations, a digest of the trace.
5. **Content Security Policy** (in `index.html`):
   ```
   default-src 'self';
   script-src 'self' 'wasm-unsafe-eval' 'sha256-…' https://cdn.jsdelivr.net;
   connect-src 'self' https://cdn.jsdelivr.net https://generativelanguage.googleapis.com;
   worker-src 'self' blob:;
   style-src 'self' 'unsafe-inline';
   img-src 'self' data:;
   font-src 'self' data:;
   ```

---

## 5. Motion System & Choreography

Motion communicates semantics:
- **Execution Cursor:** Moves between lines using spring physics (`stiffness: 520, damping: 42, mass: 0.9`). Long jumps (>12 lines) fade out and in.
- **Variable Mutations:** Old value rolls out, new value rolls in with `--exec-soft` tint that decays over 900ms.
- **Arrays & Collections:** Only the modified cells animate; a swap highlights both cells. Index and pointer markers glide between cells.
- **Stack & Queue:** Stacks drop items in from top and lift them out; queues slide items in from the rear and exit from the front.
- **Accessibility:** With `prefers-reduced-motion: reduce`, all spatial translations and springs are disabled and replaced with 120ms crossfades and tints.


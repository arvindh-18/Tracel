# Tracel Architecture Specification

This document details the architectural principles, data flow, invertibility guarantees, security posture, and motion choreography of **Tracel**.

---

## 1. High-Level Pipeline

```
SOURCE CODE (Python, C, C++)
       │
       ▼
LANGUAGE ADAPTER  (LanguageAdapter.run → RawTrace: a full snapshot per step)
  ├─ Python: Web Worker + Pyodide (CPython 3.12 WASM) + sys.settrace + serializer
  └─ C / C++: AiClikeAdapter
       ├─ Tracel interpreter (src/engine/adapters/clike): tokenizer → parser → tree-walking
       │  evaluator over typed memory blocks, on the main thread
       └─ only if the interpreter rejects a feature, or Settings say "Always AI":
            client.ts ── POST /api/trace ──► traceHandler (server; holds GEMINI_API_KEY)
                                               └─ Gemini, structured JSON: steps of operations
            zod validation (one retry with the error) ◄──┘
            replay.ts: operations → frames + memory model → full snapshots
       │
       ▼ RawTrace (snapshots, stdout, status, error)
TRACE CORE (language-agnostic)
  ├─ normalize: heap versions with structural sharing, stable HeapIds
  ├─ diff: variable, call/return and container events (set, push, pop, swap, enqueue…)
  ├─ lens-infer: comment pragmas, type matching, name heuristics
  └─ narrate: deterministic sentence per step
       │
       ▼ Trace
OPTIONAL AI EXPLAIN PASS (Settings → AI explanations)
  digest of the real trace ── POST /api/trace (mode: explain) ──► narrations, lens hints,
  error explanation; merged only where they fit (narration needs one per step). Never changes state.
       │
       ▼
STATE MODEL (Zustand: session + playback + prefs)
       │ stateAt(step) → ViewState { frames, heap, output, events }
       ▼
VISUALIZATION
  ├─ CodeMirror 6 editor with the execution line
  ├─ Lens: Frames, Array, Stack, Queue, LinkedList, Dict, Object views. Pointers show as
  │  markers on the array cells and list nodes they target, and hovering a pointer highlights its target
  └─ Timeline dock: transport, scrubber, speed
```

### AI simulation contract

The model never sends whole snapshots. Each step is `{ line, narration, ops[] }`, where an op is one of `call`, `return`, `declare`, `assign`, `alloc`, `free`, `write`, `push`, `pop`, `enqueue`, `dequeue`, `push_back`, `pop_back`, `print`, `read_input`, `error`. Values use one flat shape, `{ k, v?, id?, offset?, t? }`, because Gemini rejects deeply nested schemas. The schema lives in `src/engine/adapters/ai/schema.ts` and the prompt, with two worked examples, in `prompts.ts`.

`replay.ts` is deterministic. It owns all state, applies the operations in order, and records a snapshot after each step. Pointers become `{ k: 'ptr', id, offset, t, address }`, with `id` naming a block or, for `&x`, the variable. Bounds, use-after-free, double free and empty-container checks run on every operation. An impossible operation ends the trace with an `InvalidAiTrace` error at that line, rather than inventing state.

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

New languages (e.g. JavaScript, Rust, Go) implement `LanguageAdapter` in `src/engine/adapters/types.ts`:
```ts
interface LanguageAdapter {
  id: 'python' | 'c' | 'cpp';
  displayName: string;
  engineLabel: string;
  fileExtension: string;
  prepare(): Promise<void>;
  run(req: RunRequest, onProgress?: (stepCount: number) => void): Promise<RawTrace>;
  supportInfo: SupportInfo;
}
```
Adapters are registered with `engineHost` (`src/engine/host.ts`). The UI and Lens visualizers never import language-specific code.

---

## 4. Security Architecture & Honest Limits

1. **Client-Side Execution:** Python runs in a Web Worker; the C/C++ interpreter runs in the page. No user code is executed on a server. With the AI features on, the source (and, for explanations, a digest of the trace) is sent to `/api/trace` and from there to Google Gemini; the API key never reaches the browser.
2. **Pyodide Environment:**
   - Network APIs (`fetch`, `XMLHttpRequest`, `WebSocket`) and dynamic script loading (`importScripts`) are stripped from worker global scope after Pyodide initialization.
   - A builtin import hook enforces an allowlist for imports made by the user's program (`math`, `random`, `collections`, `heapq`, `itertools`, etc.); anything else, including `os`, `sys`, `subprocess` and `socket`, raises an immediate `ImportError`.
   - Security boundary is the browser WebAssembly sandbox; import hooks provide defense-in-depth and clear developer feedback.
3. **Execution Limits & Watchdog:**
   - Step limit: default 5,000 steps (configurable up to 20,000) produces a clean partial trace.
   - Main-thread watchdog: terminates the Python worker after 8 seconds of wall-clock time if a native loop hangs; the next run starts a fresh worker. Stop terminates it immediately and aborts any AI request.
   - AI proxy: input validation (language, 20,000-character source), 20 requests per IP per minute, a 90-second timeout per model call.
4. **Content Security Policy (CSP):**
   ```
   default-src 'self';
   script-src 'self' 'wasm-unsafe-eval' https://cdn.jsdelivr.net;
   connect-src 'self' https://cdn.jsdelivr.net;
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


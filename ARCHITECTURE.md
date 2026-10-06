# Tracel Architecture Specification

This document details the architectural principles, data flow, invertibility guarantees, security posture, and motion choreography of **Tracel**.

---

## 1. High-Level Pipeline

```
SOURCE CODE (Python, C, C++)
       │
       ▼
LANGUAGE ADAPTER (Worker-Isolated)
  ├─ Python: Web Worker + Pyodide (CPython 3.12 WASM) + sys.settrace + serializer
  └─ C / C++: Web Worker + tree-sitter AST parser + typed block memory evaluator
       │
       ▼ RawTrace (raw snapshots per line/statement, stdout, status)
TRACE CORE (Language-Agnostic)
  ├─ normalize: heap object interning, structural sharing, stable HeapIds
  ├─ diff: sequence mutations (set, push, pop, swap), variable frames, objects
  ├─ static-map: line & range to AST constructs (if/else taken, loop iterations)
  ├─ lens-infer: comment annotations, explicit hints, type matching, heuristics
  └─ narrate: deterministic plain-English sentence per step (~80 chars)
       │
       ▼ Trace (steps[], heapVersions, stdout, status, error, stats)
STATE MODEL (Zustand: session + playback + editor + prefs)
       │ stateAt(step) -> ViewState { frames, heap, output, events }
       ▼
VISUALIZATION ENGINE
  ├─ CodeMirror 6: custom theme, animated execution cursor (translateY spring)
  ├─ Dynamic Lens: Frames, Structures (Array, Stack, Queue, LinkedList, Dict, Object)
  ├─ Arrow Layer: pointer connection curves with dynamic element anchors
  └─ Timeline Dock: transport dock, scrubber, event ticks, speed scaling
```

---

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

1. **Client-Side Sandbox:** All user execution occurs entirely inside browser Web Workers in the user's browser. No user code is ever executed on a remote server.
2. **Pyodide Environment:**
   - Network APIs (`fetch`, `XMLHttpRequest`, `WebSocket`) and dynamic script loading (`importScripts`) are stripped from worker global scope after Pyodide initialization.
   - Builtin import hook enforces an allowlist (`math`, `random`, `collections`, `itertools`, etc.). Risky modules (`os`, `sys`, `subprocess`, `socket`) raise an immediate `ImportError`.
   - Security boundary is the browser WebAssembly sandbox; import hooks provide defense-in-depth and clear developer feedback.
3. **Execution Limits & Watchdog:**
   - Step limit: default 5,000 steps (configurable up to 20,000) produces a clean partial trace.
   - Main-thread watchdog: terminates the worker after 8 seconds of wall-clock time if a native loop hangs, respawning a fresh worker.
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
- **Arrays & Collections:** Only the modified cell animates. Swap operations travel along FLIP arcs.
- **Stack & Queue:** Stacks drop items in from top and lift them out; queues slide items in from the rear and exit from the front.
- **Accessibility:** With `prefers-reduced-motion: reduce`, all spatial translations and springs are disabled and replaced with 120ms crossfades and tints.


// Language-independent trace model shared by every adapter and the UI.

export type StepIndex = number;
export type HeapId = string;
export type FrameId = string;

export type Primitive =
  | { k: 'int'; v: string; t?: string } // string to preserve 64-bit / bigints
  | { k: 'float'; v: number; t?: string }
  | { k: 'bool'; v: boolean }
  | { k: 'str'; v: string } // Python str, C++ std::string inline
  | { k: 'char'; v: number } // char code
  | { k: 'none' } // None / nullptr / NULL
  | { k: 'uninit'; t: string } // C/C++ declared but not initialized
  | { k: 'fn'; name: string };

export type Value =
  | Primitive
  | { k: 'ref'; id: HeapId } // Reference to heap object
  | { k: 'ptr'; id: HeapId | null; offset: number; t: string; address: string } // C/C++ pointer
  | { k: 'inline'; id: HeapId }; // C array/struct stored in-frame

export type HeapKind =
  | 'list'
  | 'tuple'
  | 'dict'
  | 'set'
  | 'deque'
  | 'instance'
  | 'class'
  | 'array'
  | 'struct'
  | 'vector'
  | 'cpp_stack'
  | 'cpp_queue'
  | 'cpp_deque'
  | 'pair';

export type LensKind =
  | 'array'
  | 'stack'
  | 'queue'
  | 'linked_list'
  | 'tree'
  | 'grid'
  | 'dict'
  | 'set'
  | 'object';

export interface HeapObject {
  id: HeapId;
  kind: HeapKind;
  typeName: string; // "list", "Node", "int[5]", "std::vector<int>"
  region: 'heap' | 'stack' | 'static';
  address?: string; // synthetic, C/C++ only
  items?: Value[]; // ordered containers
  entries?: [Value, Value][]; // dict
  fields?: [string, Value][]; // instance / struct
  freed?: boolean; // C/C++ after free / delete
  truncated?: { shown: number; total: number };
  version: number; // increments on mutation
}

export interface Frame {
  id: FrameId;
  name: string; // "add", "<module>", "main"
  line: number;
  locals: [string, Value][]; // declaration order preserved
  returnValue?: Value; // on return steps
}

export type StepKind = 'line' | 'call' | 'return' | 'exception' | 'end' | 'limit';

export type TraceEvent =
  | { type: 'var_create'; frame: FrameId; name: string; value: Value }
  | { type: 'var_update'; frame: FrameId; name: string; from: Value; to: Value }
  | { type: 'var_delete'; frame: FrameId; name: string }
  | { type: 'obj_create'; id: HeapId }
  | { type: 'obj_free'; id: HeapId }
  | { type: 'item_set'; id: HeapId; index: number; from: Value; to: Value }
  | { type: 'item_insert'; id: HeapId; index: number; value: Value; op?: 'push' | 'enqueue' | 'append' | 'push_front' }
  | { type: 'item_remove'; id: HeapId; index: number; value: Value; op?: 'pop' | 'dequeue' | 'pop_front' }
  | { type: 'item_swap'; id: HeapId; i: number; j: number }
  | { type: 'entry_set'; id: HeapId; key: Value; from?: Value; to: Value }
  | { type: 'entry_delete'; id: HeapId; key: Value }
  | { type: 'field_set'; id: HeapId; field: string; from?: Value; to: Value }
  | { type: 'call'; frame: FrameId; name: string; args: [string, Value][] }
  | { type: 'return'; frame: FrameId; value: Value | null }
  | { type: 'branch'; line: number; construct: 'if' | 'elif' | 'else' | 'while' | 'for' | 'ternary' | 'switch'; taken: boolean }
  | { type: 'loop_iter'; line: number; iteration: number }
  | { type: 'output'; text: string }
  | { type: 'error'; error: TraceError }
  | { type: 'end'; exitCode?: number };

export interface TraceError {
  phase: 'parse' | 'unsupported' | 'runtime' | 'limit';
  kind: string; // "IndexError", "OutOfBounds", "NullDereference", "StepLimit"...
  line: number;
  column?: number;
  message: string; // raw runtime message
  title: string; // friendly title: "Index out of range"
  explanation: string; // plain-language sentence
  context: { name: string; value: Value }[]; // variables involved
  stateNote?: string; // "The program stopped before numbers was modified."
}

export interface Step {
  index: StepIndex;
  line: number;
  range?: { from: number; to: number }; // character offset
  kind: StepKind;
  frames: Frame[]; // outermost first
  heap: Record<HeapId, number>; // id -> version (structural sharing)
  stdoutLength: number;
  events: TraceEvent[];
  narration: string;
}

export interface Trace {
  language: 'python' | 'c' | 'cpp';
  source: string;
  sourceHash: string;
  steps: Step[];
  heapVersions: Record<HeapId, HeapObject[]>; // heapId -> versions list
  stdout: string;
  status: 'completed' | 'error' | 'limit';
  error?: TraceError;
  stats: { steps: number; maxDepth: number; durationMs: number };
  lensHints: Record<HeapId, LensKind>;
  /** 'ai' when Gemini simulated the program; its state can occasionally be wrong. */
  engine: 'native' | 'ai';
  /** Set when AI explanations were merged into narration, lens hints or the error. */
  aiExplained?: boolean;
  /** Why the AI explanation pass didn't apply; shown as a toast. */
  aiNotice?: string;
  /** Gemini's 2-3 sentence summary of what the program does. */
  aiOverview?: string;
}

export interface ViewState {
  step: Step;
  frames: Frame[];
  heap: Record<HeapId, HeapObject>;
  output: string;
  events: TraceEvent[];
}


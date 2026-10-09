import { clearStateCache } from '../trace/reconstruct';
import { create } from 'zustand';
import { Trace, TraceError } from '../trace/schema';
import { getDefaultExample } from '../features/examples/registry';
import { defaultLcExample } from '../features/leetcode/examples';

export type SupportedLanguage = 'python' | 'c' | 'cpp';

export interface SessionState {
  language: SupportedLanguage;
  codeByLanguage: Record<SupportedLanguage, string>;
  trace: Trace | null;
  isRunning: boolean;
  runProgress: number; // steps traced so far
  isStale: boolean;
  runtimeLoading: boolean;
  runtimeLoadProgress: string;
  error: TraceError | null;
  stdin: string;
  /** LeetCode mode: the editor holds a Solution class and runs with a test case. */
  leetcode: boolean;
  testCaseByLanguage: Record<SupportedLanguage, string>;
  /** Which Solution method to run, when there are several. */
  lcMethod: string | null;

  // Actions
  setLanguage: (lang: SupportedLanguage) => void;
  setCode: (code: string) => void;
  setTrace: (trace: Trace | null) => void;
  setIsRunning: (running: boolean) => void;
  setRunProgress: (steps: number) => void;
  setIsStale: (stale: boolean) => void;
  setRuntimeLoading: (loading: boolean, progress?: string) => void;
  setError: (error: TraceError | null) => void;
  setStdin: (input: string) => void;
  setLeetcode: (on: boolean) => void;
  setTestCase: (text: string) => void;
  setLcMethod: (name: string | null) => void;
  resetSession: () => void;
}

const initialCode: Record<SupportedLanguage, string> = {
  python: getDefaultExample('python').code,
  c: getDefaultExample('c').code,
  cpp: getDefaultExample('cpp').code,
};

// Load saved code from localStorage if available
try {
  const savedPy = localStorage.getItem('tracel:code:python');
  if (savedPy) initialCode.python = savedPy;
  const savedC = localStorage.getItem('tracel:code:c');
  if (savedC) initialCode.c = savedC;
  const savedCpp = localStorage.getItem('tracel:code:cpp');
  if (savedCpp) initialCode.cpp = savedCpp;
} catch {
  // localStorage not available
}

// Each mode keeps its own code per language; switching modes swaps the editor contents.
const codeKey = (lc: boolean, lang: SupportedLanguage) => (lc ? `tracel:lc-code:${lang}` : `tracel:code:${lang}`);
const readStored = (key: string) => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};
const store = (key: string, value: string) => {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Not persisted.
  }
};
const savedCode: Record<'normal' | 'lc', Record<SupportedLanguage, string>> = {
  normal: { ...initialCode },
  lc: {
    python: readStored(codeKey(true, 'python')) ?? defaultLcExample('python')?.code ?? '',
    c: '',
    cpp: readStored(codeKey(true, 'cpp')) ?? defaultLcExample('cpp')?.code ?? '',
  },
};
const initialTestCases: Record<SupportedLanguage, string> = {
  python: readStored('tracel:lc-test:python') ?? defaultLcExample('python')?.testCase ?? '',
  c: '',
  cpp: readStored('tracel:lc-test:cpp') ?? defaultLcExample('cpp')?.testCase ?? '',
};

export const useSessionStore = create<SessionState>((set, get) => ({
  language: 'python',
  codeByLanguage: initialCode,
  trace: null,
  isRunning: false,
  runProgress: 0,
  isStale: false,
  runtimeLoading: false,
  runtimeLoadProgress: '',
  error: null,
  stdin: '',
  leetcode: false,
  testCaseByLanguage: initialTestCases,
  lcMethod: null,

  setLanguage: (language) => {
    // C has no classes, so LeetCode mode is for C++ and Python.
    if (language === 'c' && get().leetcode) get().setLeetcode(false);
    set({ language, isStale: false, trace: null, error: null, lcMethod: null });
    try {
      localStorage.setItem('tracel:last-language', language);
    } catch {}
  },

  setCode: (code) => {
    const lang = get().language;
    set((state) => ({
      codeByLanguage: { ...state.codeByLanguage, [lang]: code },
      isStale: state.trace !== null, // Mark trace as stale if code changed
    }));
    savedCode[get().leetcode ? 'lc' : 'normal'][lang] = code;
    store(codeKey(get().leetcode, lang), code);
  },

  setLeetcode: (on) => {
    const { leetcode, codeByLanguage } = get();
    if (on === leetcode) return;
    savedCode[leetcode ? 'lc' : 'normal'] = { ...codeByLanguage };
    set({ leetcode: on, codeByLanguage: { ...savedCode[on ? 'lc' : 'normal'] }, trace: null, error: null, isStale: false, lcMethod: null });
  },

  setTestCase: (text) => {
    const lang = get().language;
    set((s) => ({ testCaseByLanguage: { ...s.testCaseByLanguage, [lang]: text }, isStale: s.trace !== null }));
    store(`tracel:lc-test:${lang}`, text);
  },

  setLcMethod: (lcMethod) => set({ lcMethod }),

  setTrace: (trace) => {
    // Cached view states are keyed by source; a new run of the same code must not reuse them.
    clearStateCache();
    set({
      trace,
      isStale: false,
      isRunning: false,
      error: trace?.error ?? null,
    });
  },

  setIsRunning: (isRunning) => set({ isRunning }),
  setRunProgress: (runProgress) => set({ runProgress }),
  setIsStale: (isStale) => set({ isStale }),
  setRuntimeLoading: (runtimeLoading, progress = '') =>
    set({ runtimeLoading, runtimeLoadProgress: progress }),
  setError: (error) => set({ error }),
  setStdin: (stdin) => set({ stdin }),

  resetSession: () => {
    set({
      trace: null,
      isStale: false,
      isRunning: false,
      error: null,
    });
  },
}));


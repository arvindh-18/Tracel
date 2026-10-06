import { create } from 'zustand';
import { Trace, TraceError } from '../trace/schema';
import { getDefaultExample } from '../features/examples/registry';

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

  setLanguage: (language) => {
    set({ language, isStale: false, trace: null, error: null });
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
    try {
      localStorage.setItem(`tracel:code:${lang}`, code);
    } catch {}
  },

  setTrace: (trace) => {
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


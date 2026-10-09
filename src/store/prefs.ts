import { create } from 'zustand';

export type ThemePref = 'system' | 'light' | 'dark';

// index.html reads this key before React mounts; keep the two in sync.
export const THEME_STORAGE_KEY = 'tracel:theme';

function readStoredTheme(): ThemePref {
  try {
    const v = localStorage.getItem(THEME_STORAGE_KEY);
    if (v === 'light' || v === 'dark' || v === 'system') return v;
  } catch {
    // Storage can be unavailable (private mode, blocked site data).
  }
  return 'system';
}

export type AiSimulateMode = 'auto' | 'never' | 'always';

const AI_PREFS_KEY = 'tracel:ai-prefs';

interface AiPrefs {
  aiExplanations: boolean;
  aiSimulate: AiSimulateMode;
  aiStepLimit: number;
}

function readAiPrefs(): AiPrefs {
  const defaults: AiPrefs = { aiExplanations: false, aiSimulate: 'auto', aiStepLimit: 500 };
  try {
    const stored = JSON.parse(localStorage.getItem(AI_PREFS_KEY) ?? '{}') as Partial<AiPrefs>;
    return {
      aiExplanations: typeof stored.aiExplanations === 'boolean' ? stored.aiExplanations : defaults.aiExplanations,
      aiSimulate: stored.aiSimulate === 'never' || stored.aiSimulate === 'always' ? stored.aiSimulate : defaults.aiSimulate,
      aiStepLimit: typeof stored.aiStepLimit === 'number' ? stored.aiStepLimit : defaults.aiStepLimit,
    };
  } catch {
    return defaults;
  }
}

export interface PrefsState {
  theme: ThemePref;
  fontSize: number;
  reducedMotion: boolean;
  showAddresses: boolean;
  stepLimit: number;
  /** Gemini narration, lens choices and error explanations on top of the real trace. */
  aiExplanations: boolean;
  /** C/C++: auto = interpreter, with Gemini for features it can't run. */
  aiSimulate: AiSimulateMode;
  aiStepLimit: number;

  setTheme: (theme: ThemePref) => void;
  setFontSize: (size: number) => void;
  setReducedMotion: (reduced: boolean) => void;
  setShowAddresses: (show: boolean) => void;
  setStepLimit: (limit: number) => void;
  setAiPrefs: (prefs: Partial<AiPrefs>) => void;
}

export const usePrefsStore = create<PrefsState>((set, get) => ({
  theme: readStoredTheme(),
  fontSize: 13.5,
  reducedMotion: false,
  showAddresses: true,
  stepLimit: 5000,
  ...readAiPrefs(),

  setTheme: (theme) => {
    set({ theme });
    try {
      localStorage.setItem(THEME_STORAGE_KEY, theme);
    } catch {
      // Not persisted; the choice still applies for this session.
    }
  },
  setFontSize: (fontSize) => set({ fontSize }),
  setReducedMotion: (reducedMotion) => set({ reducedMotion }),
  setShowAddresses: (showAddresses) => set({ showAddresses }),
  setStepLimit: (stepLimit) => set({ stepLimit }),
  setAiPrefs: (prefs) => {
    set(prefs);
    const { aiExplanations, aiSimulate, aiStepLimit } = get();
    try {
      localStorage.setItem(AI_PREFS_KEY, JSON.stringify({ aiExplanations, aiSimulate, aiStepLimit }));
    } catch {
      // Applies for this session only.
    }
  },
}));

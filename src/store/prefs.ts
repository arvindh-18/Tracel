import { DEFAULT_AI_MODEL } from '../engine/adapters/ai/config';
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

const AI_PREFS_KEY = 'tracel:ai-prefs';

interface AiPrefs {
  aiExplanations: boolean;
  aiModel: string;
  aiStepLimit: number;
}

function readAiPrefs(): AiPrefs {
  const defaults: AiPrefs = { aiExplanations: true, aiModel: DEFAULT_AI_MODEL, aiStepLimit: 500 };
  try {
    const stored = JSON.parse(localStorage.getItem(AI_PREFS_KEY) ?? '{}') as Partial<AiPrefs>;
    return {
      aiExplanations: typeof stored.aiExplanations === 'boolean' ? stored.aiExplanations : defaults.aiExplanations,
      aiModel: typeof stored.aiModel === 'string' && stored.aiModel ? stored.aiModel : defaults.aiModel,
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
  /** With a Gemini key: narration, an overview and lens choices after each run. */
  aiExplanations: boolean;
  aiModel: string;
  /** Cap on steps when Gemini simulates an unsupported C++ program. */
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
    const { aiExplanations, aiModel, aiStepLimit } = get();
    try {
      localStorage.setItem(AI_PREFS_KEY, JSON.stringify({ aiExplanations, aiModel, aiStepLimit }));
    } catch {
      // Applies for this session only.
    }
  },
}));

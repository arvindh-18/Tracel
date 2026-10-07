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

export interface PrefsState {
  theme: ThemePref;
  fontSize: number;
  reducedMotion: boolean;
  showAddresses: boolean;
  stepLimit: number;

  setTheme: (theme: ThemePref) => void;
  setFontSize: (size: number) => void;
  setReducedMotion: (reduced: boolean) => void;
  setShowAddresses: (show: boolean) => void;
  setStepLimit: (limit: number) => void;
}

export const usePrefsStore = create<PrefsState>((set) => ({
  theme: readStoredTheme(),
  fontSize: 13.5,
  reducedMotion: false,
  showAddresses: true,
  stepLimit: 5000,

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
}));

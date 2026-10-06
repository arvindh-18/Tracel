import { create } from 'zustand';

export interface PrefsState {
  fontSize: number;
  reducedMotion: boolean;
  showAddresses: boolean;
  stepLimit: number;

  setFontSize: (size: number) => void;
  setReducedMotion: (reduced: boolean) => void;
  setShowAddresses: (show: boolean) => void;
  setStepLimit: (limit: number) => void;
}

export const usePrefsStore = create<PrefsState>((set) => ({
  fontSize: 13.5,
  reducedMotion: false,
  showAddresses: true,
  stepLimit: 5000,

  setFontSize: (fontSize) => set({ fontSize }),
  setReducedMotion: (reducedMotion) => set({ reducedMotion }),
  setShowAddresses: (showAddresses) => set({ showAddresses }),
  setStepLimit: (stepLimit) => set({ stepLimit }),
}));


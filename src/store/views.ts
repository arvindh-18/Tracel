import { create } from 'zustand';

export type ArrayLayout = 'array' | 'tree';

interface ViewState {
  /** Per variable (language:name): draw an array as a row or as a binary tree. */
  layouts: Record<string, ArrayLayout>;
  setLayout: (key: string, layout: ArrayLayout) => void;
}

export const useViewStore = create<ViewState>((set) => ({
  layouts: {},
  setLayout: (key, layout) => set((s) => ({ layouts: { ...s.layouts, [key]: layout } })),
}));

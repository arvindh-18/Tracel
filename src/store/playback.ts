import { create } from 'zustand';
import { useSessionStore } from './session';

export type PlaybackSpeed = 0.5 | 1 | 1.5 | 2 | 4;

export interface PlaybackState {
  currentStepIndex: number;
  isPlaying: boolean;
  speed: PlaybackSpeed;
  breakpoints: Set<number>;
  isScrubbing: boolean;

  // Actions
  play: () => void;
  pause: () => void;
  togglePlay: () => void;
  stepForward: () => void;
  stepBack: () => void;
  jumpToStep: (index: number) => void;
  restart: () => void;
  jumpToEnd: () => void;
  setSpeed: (speed: PlaybackSpeed) => void;
  toggleBreakpoint: (line: number) => void;
  setIsScrubbing: (scrubbing: boolean) => void;
}

let playbackTimerId: number | null = null;
let lastStepTime = 0;

export const usePlaybackStore = create<PlaybackState>((set, get) => {
  // rAF playback loop
  const tick = (time: number) => {
    const { isPlaying, speed, currentStepIndex, breakpoints } = get();
    if (!isPlaying) return;

    const trace = useSessionStore.getState().trace;
    if (!trace || trace.steps.length === 0) {
      get().pause();
      return;
    }

    const interval = 700 / speed;

    if (time - lastStepTime >= interval) {
      lastStepTime = time;
      const nextIndex = currentStepIndex + 1;

      if (nextIndex >= trace.steps.length) {
        // Reached end of trace
        get().pause();
        return;
      }

      const nextStep = trace.steps[nextIndex];
      // Check breakpoint hit
      if (nextStep && breakpoints.has(nextStep.line)) {
        set({ currentStepIndex: nextIndex });
        get().pause();
        return;
      }

      set({ currentStepIndex: nextIndex });
    }

    playbackTimerId = requestAnimationFrame(tick);
  };

  const startLoop = () => {
    if (playbackTimerId !== null) cancelAnimationFrame(playbackTimerId);
    lastStepTime = performance.now();
    playbackTimerId = requestAnimationFrame(tick);
  };

  const stopLoop = () => {
    if (playbackTimerId !== null) {
      cancelAnimationFrame(playbackTimerId);
      playbackTimerId = null;
    }
  };

  return {
    currentStepIndex: 0,
    isPlaying: false,
    speed: 1,
    breakpoints: new Set<number>(),
    isScrubbing: false,

    play: () => {
      const trace = useSessionStore.getState().trace;
      if (!trace || trace.steps.length === 0) return;

      const { currentStepIndex } = get();
      // If at end, loop back to start
      if (currentStepIndex >= trace.steps.length - 1) {
        set({ currentStepIndex: 0 });
      }

      set({ isPlaying: true });
      startLoop();
    },

    pause: () => {
      set({ isPlaying: false });
      stopLoop();
    },

    togglePlay: () => {
      if (get().isPlaying) {
        get().pause();
      } else {
        get().play();
      }
    },

    stepForward: () => {
      get().pause();
      const trace = useSessionStore.getState().trace;
      if (!trace) return;
      set((s) => ({
        currentStepIndex: Math.min(trace.steps.length - 1, s.currentStepIndex + 1),
      }));
    },

    stepBack: () => {
      get().pause();
      set((s) => ({
        currentStepIndex: Math.max(0, s.currentStepIndex - 1),
      }));
    },

    jumpToStep: (index) => {
      const trace = useSessionStore.getState().trace;
      const maxIdx = trace ? trace.steps.length - 1 : 0;
      const clamped = Math.max(0, Math.min(maxIdx, index));
      set({ currentStepIndex: clamped });
    },

    restart: () => {
      get().pause();
      set({ currentStepIndex: 0 });
    },

    jumpToEnd: () => {
      get().pause();
      const trace = useSessionStore.getState().trace;
      if (trace) {
        set({ currentStepIndex: trace.steps.length - 1 });
      }
    },

    setSpeed: (speed) => {
      set({ speed });
    },

    toggleBreakpoint: (line) => {
      set((s) => {
        const next = new Set(s.breakpoints);
        if (next.has(line)) next.delete(line);
        else next.add(line);
        return { breakpoints: next };
      });
    },

    setIsScrubbing: (isScrubbing) => {
      if (isScrubbing) get().pause();
      set({ isScrubbing });
    },
  };
});


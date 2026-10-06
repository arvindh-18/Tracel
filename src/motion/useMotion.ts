import { useMemo } from 'react';
import { motionTokens } from './tokens';

export function useMotion(speedMultiplier = 1, isScrubbing = false) {
  // Check prefers-reduced-motion
  const prefersReduced = useMemo(() => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }, []);

  const isInstant = prefersReduced || isScrubbing || speedMultiplier >= 4;

  const scaledDuration = useMemo(() => {
    if (isInstant) return { instant: 0, fast: 0, base: 0, slow: 0, tint: 0.9 };
    // Scale duration inversely to speed, with a reasonable floor
    const scale = Math.max(0.25, 1 / speedMultiplier);
    return {
      instant: Math.max(0.04, motionTokens.duration.instant * scale),
      fast: Math.max(0.06, motionTokens.duration.fast * scale),
      base: Math.max(0.08, motionTokens.duration.base * scale),
      slow: Math.max(0.12, motionTokens.duration.slow * scale),
      tint: motionTokens.duration.tint,
    };
  }, [speedMultiplier, isInstant]);

  return {
    tokens: motionTokens,
    scaledDuration,
    isInstant,
    prefersReduced,
  };
}


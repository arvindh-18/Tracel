// Motion's JS animations need numbers in seconds while CSS transitions need
// the custom properties in tokens.css, so the values live in both places.
// Keep them identical.
export const motionTokens = {
  duration: {
    fast: 0.12,
    base: 0.2,
    slow: 0.3,
    tint: 0.9,
  },
  ease: {
    standard: [0.2, 0, 0, 1] as const,
  },
  // The one spring: structure items reordering, entering or leaving.
  layoutSpring: {
    type: 'spring' as const,
    stiffness: 420,
    damping: 38,
  },
};

// Motion tokens matching Tracel design specification
export const motionTokens = {
  duration: {
    instant: 0.08,
    fast: 0.14,
    base: 0.22,
    slow: 0.32,
    tint: 0.9,
  },
  durationMs: {
    instant: 80,
    fast: 140,
    base: 220,
    slow: 320,
    tint: 900,
  },
  ease: {
    standard: [0.2, 0, 0, 1] as const,
    enter: [0, 0, 0, 1] as const,
    exit: [0.4, 0, 1, 1] as const,
  },
  spring: {
    line: {
      type: 'spring' as const,
      stiffness: 520,
      damping: 42,
      mass: 0.9,
    },
    layout: {
      type: 'spring' as const,
      stiffness: 420,
      damping: 38,
    },
  },
};


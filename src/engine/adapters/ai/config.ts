// AI settings. Gemini is called directly from the browser with the visitor's own key.

export const AI_MODELS = [
  { id: 'gemini-3.8-flash', label: 'Gemini 3.8 Flash (default)' },
  { id: 'gemini-3.5-flash-lite', label: 'Gemini 3.5 Flash-Lite (faster, cheaper)' },
] as const;

/** Default Gemini model; Settings can pick another from AI_MODELS. */
export const DEFAULT_AI_MODEL: string = AI_MODELS[0].id;

/** Where visitors get a free key. */
export const GET_KEY_URL = 'https://aistudio.google.com/apikey';

/** Default cap on steps in an AI-simulated trace (Settings can change it). */
export const DEFAULT_AI_STEP_LIMIT = 500;
export const MAX_AI_STEP_LIMIT = 2000;

/** Longest source sent to Gemini. */
export const MAX_SOURCE_CHARS = 20_000;

/** Budget for one Gemini call; a retry gets its own. */
export const AI_REQUEST_TIMEOUT_MS = 60_000;

/** Longest trace the explain pass describes. */
export const MAX_DIGEST_STEPS = 400;

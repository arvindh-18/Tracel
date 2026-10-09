// One place for AI settings shared by the browser and the /api/trace handler.

/** Default Gemini model. The server can override it with GEMINI_MODEL. */
export const DEFAULT_AI_MODEL = 'gemini-3.8-flash';

/** Default cap on steps in an AI-simulated trace (Settings can change it). */
export const DEFAULT_AI_STEP_LIMIT = 500;
export const MAX_AI_STEP_LIMIT = 2000;

/** Longest source the proxy accepts. */
export const MAX_SOURCE_CHARS = 20_000;
export const MAX_STDIN_CHARS = 5_000;

/** Server-side budget for one model call (a retry gets its own). */
export const AI_REQUEST_TIMEOUT_MS = 90_000;

/** Requests allowed per IP per minute. */
export const RATE_LIMIT_PER_MINUTE = 20;

// The visitor's Gemini API key lives only in this browser's localStorage.
// It is never logged, never put in a URL and only ever sent to Google's API.

const KEY_STORAGE = 'tracel:gemini-key';
const listeners = new Set<() => void>();

export function getApiKey(): string | null {
  try {
    const key = localStorage.getItem(KEY_STORAGE);
    return key && key.trim() ? key.trim() : null;
  } catch {
    return null;
  }
}

export function setApiKey(key: string) {
  try {
    localStorage.setItem(KEY_STORAGE, key.trim());
  } catch {
    // Storage blocked: the key can't be remembered, so AI stays off.
  }
  listeners.forEach((l) => l());
}

export function forgetApiKey() {
  try {
    localStorage.removeItem(KEY_STORAGE);
  } catch {
    // Nothing stored.
  }
  listeners.forEach((l) => l());
}

export function onApiKeyChange(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

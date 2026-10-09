import { useSyncExternalStore } from 'react';
import { getApiKey, onApiKeyChange } from '../../engine/adapters/ai/keyStore';

/** True when the visitor has saved a Gemini key in this browser. */
export function useHasApiKey(): boolean {
  return useSyncExternalStore(onApiKeyChange, () => getApiKey() !== null);
}

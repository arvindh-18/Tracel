import { useEffect, useRef } from 'react';
import { usePrefsStore, ThemePref } from '../store/prefs';

const DARK_QUERY = '(prefers-color-scheme: dark)';
const SWITCH_CLASS = 'theme-switching';

function resolve(pref: ThemePref): 'light' | 'dark' {
  if (pref !== 'system') return pref;
  return window.matchMedia(DARK_QUERY).matches ? 'dark' : 'light';
}

/**
 * Keeps <html data-theme> in sync with the preference and, for "system",
 * with the OS. The inline script in index.html sets the first value, so the
 * cross-fade class is only added on later changes, never on first paint.
 */
export function useApplyTheme() {
  const pref = usePrefsStore((s) => s.theme);
  const fadeTimer = useRef<number | undefined>(undefined);

  useEffect(() => {
    const root = document.documentElement;

    const apply = () => {
      const next = resolve(pref);
      if (root.dataset.theme === next) return;
      root.classList.add(SWITCH_CLASS);
      root.dataset.theme = next;
      window.clearTimeout(fadeTimer.current);
      fadeTimer.current = window.setTimeout(() => root.classList.remove(SWITCH_CLASS), 200);
    };

    apply();
    if (pref !== 'system') return;

    const mql = window.matchMedia(DARK_QUERY);
    mql.addEventListener('change', apply);
    return () => mql.removeEventListener('change', apply);
  }, [pref]);
}

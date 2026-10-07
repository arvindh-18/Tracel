import React from 'react';
import styles from './Kbd.module.css';

export const isMac =
  typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);

/** Platform label for the primary modifier: ⌘ on Apple devices, Ctrl elsewhere. */
export const modKey = isMac ? '⌘' : 'Ctrl';

export const Kbd: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <kbd className={styles.kbd}>{children}</kbd>
);

/** Renders a chord such as ["⌘", "↵"] as adjacent keys. */
export const KeyCombo: React.FC<{ keys: string[] }> = ({ keys }) => (
  <span className={styles.combo}>
    {keys.map((k) => (
      <Kbd key={k}>{k}</Kbd>
    ))}
  </span>
);

import React from 'react';
import { Modal } from '../../ui/Modal';
import { Kbd, modKey } from '../../ui/Kbd';
import styles from './ShortcutsSheet.module.css';

export interface ShortcutsSheetProps {
  isOpen: boolean;
  onClose: () => void;
}

// Each entry is a list of alternatives; each alternative is a chord of keys.
const SHORTCUTS: { label: string; keys: string[][] }[] = [
  { label: 'Run or retrace', keys: [[modKey, 'Enter']] },
  { label: 'Play or pause', keys: [['Space'], [modKey, '.']] },
  { label: 'Step forward', keys: [['→'], ['F10']] },
  { label: 'Step back', keys: [['←'], ['Shift', 'F10']] },
  { label: 'First or last step', keys: [['Home'], ['End']] },
  { label: 'Restart', keys: [['R']] },
  { label: 'Playback speed, 0.5× to 4×', keys: [['1–5']] },
  { label: 'Toggle breakpoint', keys: [['F9']] },
  { label: 'Keyboard shortcuts', keys: [['?']] },
];

export const ShortcutsSheet: React.FC<ShortcutsSheetProps> = ({ isOpen, onClose }) => (
  <Modal title="Keyboard shortcuts" size="md" isOpen={isOpen} onClose={onClose}>
    <dl className={styles.list}>
      {SHORTCUTS.map((s) => (
        <div key={s.label} className={styles.row}>
          <dt>{s.label}</dt>
          <dd className={styles.keys}>
            {s.keys.map((chord, i) => (
              <React.Fragment key={chord.join('+')}>
                {i > 0 && <span className={styles.or}>or</span>}
                {chord.map((k) => (
                  <Kbd key={k}>{k}</Kbd>
                ))}
              </React.Fragment>
            ))}
          </dd>
        </div>
      ))}
    </dl>
  </Modal>
);

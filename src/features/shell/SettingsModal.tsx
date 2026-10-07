import React from 'react';
import { Monitor, Sun, Moon } from 'lucide-react';
import { usePrefsStore, ThemePref } from '../../store/prefs';
import { Modal } from '../../ui/Modal';
import { SegmentedControl } from '../../ui/SegmentedControl';
import styles from './SettingsModal.module.css';

export interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const THEME_OPTIONS: { value: ThemePref; label: React.ReactNode }[] = [
  { value: 'system', label: <><Monitor size={14} aria-hidden /> System</> },
  { value: 'light', label: <><Sun size={14} aria-hidden /> Light</> },
  { value: 'dark', label: <><Moon size={14} aria-hidden /> Dark</> },
];

const Row: React.FC<{ id: string; label: string; hint: string; children: React.ReactNode }> = ({
  id,
  label,
  hint,
  children,
}) => (
  <div className={styles.row}>
    <div>
      <label htmlFor={id} className={styles.label}>
        {label}
      </label>
      <div className={styles.hint}>{hint}</div>
    </div>
    {children}
  </div>
);

export const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose }) => {
  const theme = usePrefsStore((s) => s.theme);
  const setTheme = usePrefsStore((s) => s.setTheme);
  const reducedMotion = usePrefsStore((s) => s.reducedMotion);
  const setReducedMotion = usePrefsStore((s) => s.setReducedMotion);
  const showAddresses = usePrefsStore((s) => s.showAddresses);
  const setShowAddresses = usePrefsStore((s) => s.setShowAddresses);
  const stepLimit = usePrefsStore((s) => s.stepLimit);
  const setStepLimit = usePrefsStore((s) => s.setStepLimit);

  return (
    <Modal title="Settings" isOpen={isOpen} onClose={onClose}>
      <section className={styles.section}>
        <h3 className={styles.heading}>Theme</h3>
        <SegmentedControl fill aria-label="Theme" options={THEME_OPTIONS} value={theme} onChange={setTheme} />
      </section>

      <section className={styles.section}>
        <h3 className={styles.heading}>Running</h3>
        <Row id="settings-step-limit" label="Step limit" hint="Maximum steps traced per run">
          <select
            id="settings-step-limit"
            className={styles.select}
            value={stepLimit}
            onChange={(e) => setStepLimit(Number(e.target.value))}
          >
            <option value={2000}>2,000</option>
            <option value={5000}>5,000 (default)</option>
            <option value={10000}>10,000</option>
            <option value={20000}>20,000</option>
          </select>
        </Row>
      </section>

      <section className={styles.section}>
        <h3 className={styles.heading}>Display</h3>
        <Row id="settings-addresses" label="Pointer addresses" hint="Show memory addresses in C and C++">
          <input
            id="settings-addresses"
            type="checkbox"
            className={styles.checkbox}
            checked={showAddresses}
            onChange={(e) => setShowAddresses(e.target.checked)}
          />
        </Row>
        <Row id="settings-motion" label="Reduced motion" hint="Fade values instead of sliding them">
          <input
            id="settings-motion"
            type="checkbox"
            className={styles.checkbox}
            checked={reducedMotion}
            onChange={(e) => setReducedMotion(e.target.checked)}
          />
        </Row>
      </section>
    </Modal>
  );
};

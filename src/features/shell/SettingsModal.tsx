import React from 'react';
import { Monitor, Sun, Moon } from 'lucide-react';
import { usePrefsStore, ThemePref, AiSimulateMode } from '../../store/prefs';
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
  const aiExplanations = usePrefsStore((s) => s.aiExplanations);
  const aiSimulate = usePrefsStore((s) => s.aiSimulate);
  const aiStepLimit = usePrefsStore((s) => s.aiStepLimit);
  const setAiPrefs = usePrefsStore((s) => s.setAiPrefs);

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
        <h3 className={styles.heading}>AI (Gemini)</h3>
        <Row id="settings-ai-explain" label="AI explanations" hint="Plain-English narration and error help from Gemini">
          <input
            id="settings-ai-explain"
            type="checkbox"
            className={styles.checkbox}
            checked={aiExplanations}
            onChange={(e) => setAiPrefs({ aiExplanations: e.target.checked })}
          />
        </Row>
        <Row id="settings-ai-engine" label="C and C++ engine" hint="AI simulation can occasionally be wrong">
          <select
            id="settings-ai-engine"
            className={styles.select}
            value={aiSimulate}
            onChange={(e) => setAiPrefs({ aiSimulate: e.target.value as AiSimulateMode })}
          >
            <option value="auto">Interpreter, AI for the rest (default)</option>
            <option value="never">Interpreter only</option>
            <option value="always">Always AI-simulated</option>
          </select>
        </Row>
        <Row id="settings-ai-steps" label="AI step limit" hint="Maximum steps in an AI-simulated trace">
          <select
            id="settings-ai-steps"
            className={styles.select}
            value={aiStepLimit}
            onChange={(e) => setAiPrefs({ aiStepLimit: Number(e.target.value) })}
          >
            <option value={200}>200</option>
            <option value={500}>500 (default)</option>
            <option value={1000}>1,000</option>
            <option value={2000}>2,000</option>
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

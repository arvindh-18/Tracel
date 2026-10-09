import React, { useState } from 'react';
import { Monitor, Sun, Moon } from 'lucide-react';
import { usePrefsStore, ThemePref } from '../../store/prefs';
import { AI_MODELS, GET_KEY_URL } from '../../engine/adapters/ai/config';
import { forgetApiKey, setApiKey } from '../../engine/adapters/ai/keyStore';
import { useHasApiKey } from '../ai/useApiKey';
import { Button } from '../../ui/Button';
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

/** The visitor's own Gemini key: kept in this browser only, sent only to Google. */
const AiKeyField: React.FC = () => {
  const hasKey = useHasApiKey();
  const [draft, setDraft] = useState('');
  return (
    <div className={styles.keyBlock}>
      <label htmlFor="settings-ai-key" className={styles.label}>
        Gemini API key
      </label>
      {hasKey ? (
        <div className={styles.keyRow}>
          <span className={styles.keySaved}>Key saved in this browser</span>
          <Button size="sm" variant="ghost" onClick={forgetApiKey}>
            Forget key
          </Button>
        </div>
      ) : (
        <form
          className={styles.keyRow}
          onSubmit={(e) => {
            e.preventDefault();
            if (draft.trim()) setApiKey(draft);
            setDraft('');
          }}
        >
          <input
            id="settings-ai-key"
            type="password"
            autoComplete="off"
            spellCheck={false}
            className={styles.keyInput}
            placeholder="Paste your key"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
          />
          <Button size="sm" type="submit" disabled={!draft.trim()}>
            Save
          </Button>
        </form>
      )}
      <p className={styles.hint}>
        <a href={GET_KEY_URL} target="_blank" rel="noreferrer">
          Get a free key from Google AI Studio
        </a>
        . Everything works without one; a key adds explanations, "Explain this error" and AI simulation for unsupported C++.
      </p>
      <p className={styles.notice}>
        Your key is stored only in this browser. AI requests go straight from your browser to Google under your own key and
        Google's terms, so don't paste private code.
      </p>
    </div>
  );
};

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
  const aiModel = usePrefsStore((s) => s.aiModel);
  const hasKey = useHasApiKey();
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
        <h3 className={styles.heading}>AI (optional)</h3>
        <AiKeyField />
        <Row id="settings-ai-explain" label="AI explanations" hint="Narration and a program overview after each run">
          <input
            id="settings-ai-explain"
            type="checkbox"
            className={styles.checkbox}
            checked={aiExplanations}
            disabled={!hasKey}
            onChange={(e) => setAiPrefs({ aiExplanations: e.target.checked })}
          />
        </Row>
        <Row id="settings-ai-model" label="Model" hint="Flash-Lite is faster and uses less quota">
          <select
            id="settings-ai-model"
            className={styles.select}
            value={aiModel}
            disabled={!hasKey}
            onChange={(e) => setAiPrefs({ aiModel: e.target.value })}
          >
            {AI_MODELS.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </select>
        </Row>
        <Row id="settings-ai-steps" label="AI step limit" hint="Maximum steps when AI simulates a program">
          <select
            id="settings-ai-steps"
            className={styles.select}
            value={aiStepLimit}
            disabled={!hasKey}
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

import React, { useState } from 'react';
import { Play, Square, HelpCircle, Settings, Info, ChevronDown, Monitor, Sun, Moon } from 'lucide-react';
import { useSessionStore, SupportedLanguage } from '../../store/session';
import { usePrefsStore, ThemePref } from '../../store/prefs';
import { Button } from '../../ui/Button';
import { IconButton } from '../../ui/IconButton';
import { SegmentedControl } from '../../ui/SegmentedControl';
import { Popover, MenuGroup, MenuItem } from '../../ui/Popover';
import { EXAMPLES, Example } from '../examples/registry';
import styles from './TopBar.module.css';

export interface TopBarProps {
  onRun: () => void;
  onStop: () => void;
  onOpenShortcuts: () => void;
  onOpenSettings: () => void;
}

const LANGUAGE_OPTIONS: { value: SupportedLanguage; label: string }[] = [
  { value: 'python', label: 'Python' },
  { value: 'c', label: 'C' },
  { value: 'cpp', label: 'C++' },
];

const ENGINE_LABEL: Record<SupportedLanguage, string> = {
  python: 'CPython 3.12 (Pyodide)',
  c: 'Tracel C interpreter (subset)',
  cpp: 'Tracel C++ interpreter (subset)',
};

const THEME_CYCLE: Record<ThemePref, ThemePref> = { system: 'light', light: 'dark', dark: 'system' };
const THEME_NAME: Record<ThemePref, string> = { system: 'System', light: 'Light', dark: 'Dark' };
const THEME_ICON: Record<ThemePref, React.ReactNode> = {
  system: <Monitor size={16} />,
  light: <Sun size={16} />,
  dark: <Moon size={16} />,
};

export const TopBar: React.FC<TopBarProps> = ({ onRun, onStop, onOpenShortcuts, onOpenSettings }) => {
  const language = useSessionStore((s) => s.language);
  const setLanguage = useSessionStore((s) => s.setLanguage);
  const code = useSessionStore((s) => s.codeByLanguage[s.language]);
  const setCode = useSessionStore((s) => s.setCode);
  const isRunning = useSessionStore((s) => s.isRunning);
  const runtimeLoading = useSessionStore((s) => s.runtimeLoading);
  const runtimeLoadProgress = useSessionStore((s) => s.runtimeLoadProgress);
  const aiSimulated = useSessionStore((s) => s.trace?.engine === 'ai');
  const theme = usePrefsStore((s) => s.theme);
  const setTheme = usePrefsStore((s) => s.setTheme);

  const [examplesOpen, setExamplesOpen] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);

  const examples = EXAMPLES.filter((e) => e.language === language);
  const categories = Array.from(new Set(examples.map((e) => e.category)));

  const selectExample = (ex: Example) => {
    setCode(ex.code);
    setExamplesOpen(false);
  };

  return (
    <header className={styles.bar}>
      <div className={styles.brand}>
        <svg className={styles.mark} width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
          <path d="M4 17L10 7L15 14L20 9" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          <circle cx="15" cy="14" r="3" />
        </svg>
        <span className={styles.wordmark}>Tracel</span>
      </div>

      <div className={styles.source}>
        <SegmentedControl
          size="sm"
          aria-label="Language"
          className={styles.languages}
          options={LANGUAGE_OPTIONS}
          value={language}
          onChange={setLanguage}
        />

        <Popover
          open={examplesOpen}
          onOpenChange={setExamplesOpen}
          role="menu"
          label="Examples"
          trigger={
            <Button
              size="sm"
              variant="ghost"
              aria-haspopup="menu"
              aria-expanded={examplesOpen}
              onClick={() => setExamplesOpen((o) => !o)}
            >
              Examples
              <ChevronDown size={14} aria-hidden />
            </Button>
          }
        >
          {categories.map((cat) => (
            <MenuGroup key={cat} label={cat}>
              {examples
                .filter((e) => e.category === cat)
                .map((ex) => (
                  <MenuItem key={ex.id} selected={ex.code === code} onSelect={() => selectExample(ex)}>
                    {ex.title}
                  </MenuItem>
                ))}
            </MenuGroup>
          ))}
        </Popover>
      </div>

      <div className={styles.actions}>
        <Popover
          open={infoOpen}
          onOpenChange={setInfoOpen}
          align="end"
          label="Runtime details"
          className={styles.info}
          trigger={
            <Button
              size="sm"
              variant="ghost"
              className={styles.runtime}
              title="Runtime details"
              aria-expanded={infoOpen}
              onClick={() => setInfoOpen((o) => !o)}
            >
              <span className={styles.runtimeLabel}>{aiSimulated ? 'AI-simulated' : ENGINE_LABEL[language]}</span>
              <Info size={14} aria-label="Runtime details" />
            </Button>
          }
        >
          {language === 'python' ? (
            <>
              <h3 className={styles.infoTitle}>Python sandbox and limits</h3>
              <p>Runs real CPython in Pyodide. Allowed imports include math, collections, heapq, itertools and bisect.</p>
              <p className={styles.infoMeta}>
                Network and disk access are disabled. At most 5,000 steps per run by default. The random seed is 0.
              </p>
            </>
          ) : (
            <>
              <h3 className={styles.infoTitle}>C and C++ subset</h3>
              <p>Interprets the program with real pointer arithmetic, typed memory blocks and safety checks.</p>
              <p className={styles.infoMeta}>
                Supports arrays (1-D and 2-D), pointers, structs and classes, std::vector, std::stack, std::queue, printf/scanf and std::cout/cin.
                Undefined behaviour stops the run with the exact line. For features it can't run (templates, inheritance),
                you can ask Gemini to simulate the program with your own key; those traces are marked AI-simulated.
              </p>
            </>
          )}
        </Popover>

        <IconButton icon={<HelpCircle size={16} />} label="Keyboard shortcuts (?)" onClick={onOpenShortcuts} />
        <IconButton
          icon={THEME_ICON[theme]}
          label={`Theme: ${THEME_NAME[theme]}. Switch to ${THEME_NAME[THEME_CYCLE[theme]]}`}
          onClick={() => setTheme(THEME_CYCLE[theme])}
        />
        <IconButton icon={<Settings size={16} />} label="Settings" onClick={onOpenSettings} />

        {isRunning && runtimeLoading && runtimeLoadProgress && (
          <span className={styles.status} role="status">
            {runtimeLoadProgress}
          </span>
        )}
        {isRunning ? (
          <Button variant="primary" size="sm" className={styles.run} icon={<Square size={12} fill="currentColor" />} onClick={onStop}>
            Stop
          </Button>
        ) : (
          <Button
            variant="primary"
            size="sm"
            className={styles.run}
            icon={<Play size={12} fill="currentColor" />}
            onClick={onRun}
            loading={runtimeLoading}
          >
            {runtimeLoading ? runtimeLoadProgress || 'Preparing runtime…' : 'Run'}
          </Button>
        )}
      </div>
    </header>
  );
};

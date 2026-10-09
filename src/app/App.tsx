import { MotionConfig } from 'motion/react';
import React, { useState, useEffect, useCallback, useRef } from 'react';
import { TopBar } from '../features/shell/TopBar';
import { CodeEditor } from '../features/editor/CodeEditor';
import { LensPanel } from '../features/lens/LensPanel';
import { TimelineDock } from '../features/timeline/TimelineDock';
import { Splitter } from '../ui/Splitter';
import { ShortcutsSheet } from '../features/shell/ShortcutsSheet';
import { SettingsModal } from '../features/shell/SettingsModal';
import { useSessionStore } from '../store/session';
import { usePlaybackStore, PlaybackSpeed } from '../store/playback';
import { usePrefsStore } from '../store/prefs';
import { engineHost } from '../engine/host';
import { RunCancelled } from '../engine/adapters/types';
import { toast } from '../store/toasts';
import { Toaster } from '../ui/Toaster';
import { loadPrebuilt } from '../features/examples/prebuilt';
import { readSharedProgram } from '../features/share/share';
import { getApiKey } from '../engine/adapters/ai/keyStore';
import { SegmentedControl } from '../ui/SegmentedControl';
import { useApplyTheme } from './useTheme';
import styles from './App.module.css';

export const App: React.FC = () => {
  useApplyTheme();

  const language = useSessionStore((s) => s.language);
  const code = useSessionStore((s) => s.codeByLanguage[s.language]);
  const stdin = useSessionStore((s) => s.stdin);
  const isRunning = useSessionStore((s) => s.isRunning);
  const setTrace = useSessionStore((s) => s.setTrace);
  const setIsRunning = useSessionStore((s) => s.setIsRunning);
  const setRunProgress = useSessionStore((s) => s.setRunProgress);
  const setRuntimeLoading = useSessionStore((s) => s.setRuntimeLoading);
  const setError = useSessionStore((s) => s.setError);

  const currentStepIndex = usePlaybackStore((s) => s.currentStepIndex);
  const isPlaying = usePlaybackStore((s) => s.isPlaying);
  const play = usePlaybackStore((s) => s.play);
  const pause = usePlaybackStore((s) => s.pause);
  const togglePlay = usePlaybackStore((s) => s.togglePlay);
  const stepForward = usePlaybackStore((s) => s.stepForward);
  const stepBack = usePlaybackStore((s) => s.stepBack);
  const restart = usePlaybackStore((s) => s.restart);
  const jumpToStep = usePlaybackStore((s) => s.jumpToStep);
  const jumpToEnd = usePlaybackStore((s) => s.jumpToEnd);
  const setSpeed = usePlaybackStore((s) => s.setSpeed);
  const runIdRef = useRef(0);

  const stepLimit = usePrefsStore((s) => s.stepLimit);
  const reducedMotion = usePrefsStore((s) => s.reducedMotion);

  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [windowWidth, setWindowWidth] = useState(
    typeof window !== 'undefined' ? window.innerWidth : 1440
  );
  const [mobileTab, setMobileTab] = useState<'code' | 'lens'>('code');

  useEffect(() => {
    const handleResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const handleRun = useCallback(async () => {
    if (isRunning) return;

    const runId = ++runIdRef.current;
    setIsRunning(true);
    setRunProgress(0);

    try {
      if (language === 'python') {
        setRuntimeLoading(true, 'Preparing Python runtime…');
      }

      const { aiExplanations, aiModel } = usePrefsStore.getState();
      // An unchanged built-in example has a prebuilt trace: no engine, no network.
      const prebuilt = await loadPrebuilt(language, code, stdin);
      const wantsAi = aiExplanations && getApiKey() !== null;
      if (prebuilt && (!wantsAi || prebuilt.aiExplained) && runId === runIdRef.current) {
        setRuntimeLoading(false);
        setIsRunning(false);
        setTrace(prebuilt);
        restart();
        play();
        return;
      }
      const trace = await engineHost.execute(language, code, stdin, stepLimit, {
        onProgress: (steps) => setRunProgress(steps),
        onStatus: (message) => runId === runIdRef.current && setRuntimeLoading(true, message),
        aiExplanations,
        aiModel,
      });
      if (trace.aiNotice) toast(trace.aiNotice, 'error');
      if (runId !== runIdRef.current) return; // stopped while running

      setRuntimeLoading(false);
      setIsRunning(false);
      setTrace(trace);

      restart();
      play();
    } catch (err: any) {
      if (err instanceof RunCancelled || runId !== runIdRef.current) return;
      setRuntimeLoading(false);
      setIsRunning(false);
      setError({
        phase: 'runtime',
        kind: 'ExecutionError',
        line: 1,
        message: err.message || 'Execution failed',
        title: 'Execution Error',
        explanation: err.message || 'Failed to complete execution',
        context: [],
      });
    }
  }, [code, isRunning, language, play, restart, setError, setIsRunning, setRunProgress, setRuntimeLoading, setTrace, stdin, stepLimit]);

  // Opening a share link restores its program; then any unchanged built-in
  // example shows its prebuilt trace straight away, before anyone presses Run.
  useEffect(() => {
    const shared = readSharedProgram(window.location.hash);
    if (!shared) return;
    const session = useSessionStore.getState();
    session.setLanguage(shared.language);
    session.setCode(shared.code);
    session.setStdin(shared.stdin);
  }, []);

  useEffect(() => {
    let current = true;
    if (isRunning) return;
    loadPrebuilt(language, code, stdin).then((prebuilt) => {
      const s = useSessionStore.getState();
      if (!current || !prebuilt || s.isRunning || s.codeByLanguage[s.language] !== code || (s.trace && !s.isStale)) return;
      setTrace(prebuilt);
      restart();
    });
    return () => {
      current = false;
    };
    // Only when the program itself changes; a finished run keeps its trace.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [language, code]);

  const handleStop = useCallback(() => {
    runIdRef.current++; // any result still on its way is ignored
    engineHost.cancel(language);
    pause();
    setRuntimeLoading(false);
    setIsRunning(false);
  }, [language, pause, setIsRunning, setRuntimeLoading]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault();
        handleRun();
        return;
      }

      const targetTag = (e.target as HTMLElement)?.tagName?.toLowerCase();
      const isInputFocused = targetTag === 'input' || targetTag === 'textarea';

      if (e.key === 'F10' && !e.shiftKey) {
        e.preventDefault();
        stepForward();
        return;
      }
      if (e.key === 'F10' && e.shiftKey) {
        e.preventDefault();
        stepBack();
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.key === '.') {
        e.preventDefault();
        togglePlay();
        return;
      }

      if (isInputFocused) return;

      // Single-key shortcuts must not fire while typing in the stdin box.
      if (e.key === ' ') {
        e.preventDefault();
        togglePlay();
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        stepForward();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        stepBack();
      } else if (e.key === 'Home') {
        e.preventDefault();
        jumpToStep(0);
      } else if (e.key === 'End') {
        e.preventDefault();
        jumpToEnd();
      } else if (e.key === 'r' || e.key === 'R') {
        e.preventDefault();
        restart();
      } else if (e.key === '1') {
        setSpeed(0.5 as PlaybackSpeed);
      } else if (e.key === '2') {
        setSpeed(1 as PlaybackSpeed);
      } else if (e.key === '3') {
        setSpeed(1.5 as PlaybackSpeed);
      } else if (e.key === '4') {
        setSpeed(2 as PlaybackSpeed);
      } else if (e.key === '5') {
        setSpeed(4 as PlaybackSpeed);
      } else if (e.key === '?') {
        e.preventDefault();
        setShortcutsOpen(true);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleRun, jumpToEnd, jumpToStep, restart, setSpeed, stepBack, stepForward, togglePlay]);

  const isTablet = windowWidth >= 768 && windowWidth < 1200;
  const isMobile = windowWidth < 768;

  return (
    <MotionConfig reducedMotion={reducedMotion ? 'always' : 'user'}>
    <div className={styles.app}>
      <TopBar
        onRun={handleRun}
        onStop={handleStop}
        onOpenShortcuts={() => setShortcutsOpen(true)}
        onOpenSettings={() => setSettingsOpen(true)}
      />

      <main className={styles.main}>
        {isMobile ? (
          <div className={styles.mobile}>
            <div className={styles.mobileTabs}>
              <SegmentedControl
                fill
                aria-label="Panel"
                options={[
                  { value: 'code', label: 'Code' },
                  { value: 'lens', label: 'Trace' },
                ]}
                value={mobileTab}
                onChange={setMobileTab}
              />
            </div>
            <div className={styles.mobilePane}>
              {mobileTab === 'code' ? <CodeEditor onRun={handleRun} /> : <LensPanel />}
            </div>
          </div>
        ) : (
          <Splitter
            direction={isTablet ? 'vertical' : 'horizontal'}
            defaultSplit={isTablet ? 45 : 52}
            left={<CodeEditor onRun={handleRun} />}
            right={<LensPanel />}
          />
        )}
      </main>

      <TimelineDock />

      <ShortcutsSheet isOpen={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />
      <SettingsModal isOpen={settingsOpen} onClose={() => setSettingsOpen(false)} />
      <Toaster />
    </div>
    </MotionConfig>
  );
};

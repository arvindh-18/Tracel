import React, { useState, useEffect, useCallback } from 'react';
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

export const App: React.FC = () => {
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

  const stepLimit = usePrefsStore((s) => s.stepLimit);

  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [windowWidth, setWindowWidth] = useState(
    typeof window !== 'undefined' ? window.innerWidth : 1440
  );
  const [mobileTab, setMobileTab] = useState<'code' | 'lens'>('code');

  // Track window resizing for responsive layout
  useEffect(() => {
    const handleResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Run handler: execute Python or C/C++ in worker
  const handleRun = useCallback(async () => {
    if (isRunning) return;

    setIsRunning(true);
    setRunProgress(0);

    try {
      if (language === 'python') {
        setRuntimeLoading(true, 'Preparing Python runtime…');
      }

      const trace = await engineHost.execute(
        language,
        code,
        stdin,
        stepLimit,
        (steps) => setRunProgress(steps)
      );

      setRuntimeLoading(false);
      setIsRunning(false);
      setTrace(trace);

      // Reset playback to start and autoplay trace smoothly
      restart();
      play();
    } catch (err: any) {
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

  const handleStop = useCallback(() => {
    setIsRunning(false);
  }, [setIsRunning]);

  // Global keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // ⌘/Ctrl + Enter: Run
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault();
        handleRun();
        return;
      }

      // Check if target is inside an input or textarea
      const targetTag = (e.target as HTMLElement)?.tagName?.toLowerCase();
      const isInputFocused = targetTag === 'input' || targetTag === 'textarea';

      // Shortcuts valid anywhere
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

      // Shortcuts valid outside editor inputs
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
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        width: '100vw',
        height: '100vh',
        backgroundColor: 'var(--bg-0)',
        color: 'var(--text-1)',
        overflow: 'hidden',
        position: 'relative',
      }}
    >
      {/* Top Bar */}
      <TopBar
        onRun={handleRun}
        onStop={handleStop}
        onOpenShortcuts={() => setShortcutsOpen(true)}
        onOpenSettings={() => setSettingsOpen(true)}
      />

      {/* Main Workspace Area */}
      <main style={{ flex: 1, overflow: 'hidden', position: 'relative' }}>
        {isMobile ? (
          // Mobile Segmented Tab View (<768px)
          <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
            <div
              style={{
                display: 'flex',
                borderBottom: '1px solid var(--line-1)',
                backgroundColor: 'var(--bg-2)',
              }}
            >
              <button
                onClick={() => setMobileTab('code')}
                style={{
                  flex: 1,
                  padding: '8px',
                  fontWeight: mobileTab === 'code' ? 600 : 400,
                  color: mobileTab === 'code' ? 'var(--exec)' : 'var(--text-2)',
                  borderBottom:
                    mobileTab === 'code' ? '2px solid var(--exec)' : 'none',
                }}
              >
                Code
              </button>
              <button
                onClick={() => setMobileTab('lens')}
                style={{
                  flex: 1,
                  padding: '8px',
                  fontWeight: mobileTab === 'lens' ? 600 : 400,
                  color: mobileTab === 'lens' ? 'var(--exec)' : 'var(--text-2)',
                  borderBottom:
                    mobileTab === 'lens' ? '2px solid var(--exec)' : 'none',
                }}
              >
                Lens
              </button>
            </div>
            <div style={{ flex: 1, overflow: 'hidden' }}>
              {mobileTab === 'code' ? (
                <CodeEditor onRun={handleRun} />
              ) : (
                <LensPanel onRun={handleRun} />
              )}
            </div>
          </div>
        ) : (
          // Desktop & Tablet Splitter View
          <Splitter
            direction={isTablet ? 'vertical' : 'horizontal'}
            defaultSplit={isTablet ? 45 : 52}
            left={<CodeEditor onRun={handleRun} />}
            right={<LensPanel onRun={handleRun} />}
          />
        )}
      </main>

      {/* Timeline Transport Dock */}
      <TimelineDock />

      {/* Shortcuts Sheet Modal */}
      <ShortcutsSheet
        isOpen={shortcutsOpen}
        onClose={() => setShortcutsOpen(false)}
      />

      {/* Settings Modal */}
      <SettingsModal
        isOpen={settingsOpen}
        onClose={() => setSettingsOpen(false)}
      />
    </div>
  );
};


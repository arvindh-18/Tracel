import React, { useRef } from 'react';
import { Play, Pause, RotateCcw, ChevronLeft, ChevronRight } from 'lucide-react';
import { useSessionStore } from '../../store/session';
import { usePlaybackStore, PlaybackSpeed } from '../../store/playback';
import { stateAt } from '../../trace/reconstruct';
import { SegmentedControl } from '../../ui/SegmentedControl';
import { IconButton } from '../../ui/IconButton';
import { Badge } from '../../ui/Badge';
import { cx } from '../../ui/cx';
import styles from './TimelineDock.module.css';

const SPEED_OPTIONS: { value: PlaybackSpeed; label: string }[] = [
  { value: 0.5, label: '0.5×' },
  { value: 1, label: '1×' },
  { value: 1.5, label: '1.5×' },
  { value: 2, label: '2×' },
  { value: 4, label: '4×' },
];

export const TimelineDock: React.FC = () => {
  const trace = useSessionStore((s) => s.trace);
  const isRunning = useSessionStore((s) => s.isRunning);
  const runProgress = useSessionStore((s) => s.runProgress);

  const currentStepIndex = usePlaybackStore((s) => s.currentStepIndex);
  const isPlaying = usePlaybackStore((s) => s.isPlaying);
  const speed = usePlaybackStore((s) => s.speed);
  const togglePlay = usePlaybackStore((s) => s.togglePlay);
  const stepForward = usePlaybackStore((s) => s.stepForward);
  const stepBack = usePlaybackStore((s) => s.stepBack);
  const restart = usePlaybackStore((s) => s.restart);
  const jumpToStep = usePlaybackStore((s) => s.jumpToStep);
  const setSpeed = usePlaybackStore((s) => s.setSpeed);
  const setIsScrubbing = usePlaybackStore((s) => s.setIsScrubbing);

  const trackRef = useRef<HTMLDivElement>(null);

  const totalSteps = trace ? trace.steps.length : 0;
  const hasTrace = totalSteps > 0;
  const maxIndex = Math.max(0, totalSteps - 1);
  const progress = maxIndex > 0 ? currentStepIndex / maxIndex : 0;

  const current = trace && hasTrace ? stateAt(trace, currentStepIndex) : null;
  const currentLine = current?.step.line ?? null;

  const handlePointerDown = (e: React.PointerEvent) => {
    if (!trackRef.current || !hasTrace) return;
    setIsScrubbing(true);
    e.currentTarget.setPointerCapture(e.pointerId);

    const update = (clientX: number) => {
      const rect = trackRef.current!.getBoundingClientRect();
      const pct = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      jumpToStep(Math.round(pct * maxIndex));
    };
    update(e.clientX);

    const onMove = (ev: PointerEvent) => update(ev.clientX);
    const onUp = () => {
      setIsScrubbing(false);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  const status = isRunning
    ? `Tracing… ${runProgress.toLocaleString()} steps`
    : hasTrace
      ? current?.step.narration || 'Executing program'
      : 'Not run yet';

  return (
    <footer className={styles.dock}>
      <div className={styles.status}>
        {hasTrace && currentLine && (
          <Badge variant="exec" mono>
            Line {currentLine}
          </Badge>
        )}
        <span className={styles.narration} aria-live="polite">
          {status}
        </span>
        {hasTrace && (
          <span className={styles.counter}>
            Step {currentStepIndex + 1} / {totalSteps}
          </span>
        )}
      </div>

      <div className={styles.controls}>
        <div className={styles.transport}>
          <IconButton
            icon={<ChevronLeft size={18} />}
            label="Step back (← or Shift+F10)"
            disabled={!hasTrace || currentStepIndex === 0}
            onClick={stepBack}
          />
          <IconButton
            icon={isPlaying ? <Pause size={16} /> : <Play size={16} />}
            label={isPlaying ? 'Pause (Space)' : 'Play (Space)'}
            active={isPlaying}
            disabled={!hasTrace}
            onClick={togglePlay}
          />
          <IconButton
            icon={<ChevronRight size={18} />}
            label="Step forward (→ or F10)"
            disabled={!hasTrace || currentStepIndex >= maxIndex}
            onClick={stepForward}
          />
          <IconButton icon={<RotateCcw size={15} />} label="Restart (R)" disabled={!hasTrace} onClick={restart} />
        </div>

        <div
          ref={trackRef}
          role="slider"
          aria-label="Step"
          aria-valuemin={0}
          aria-valuemax={maxIndex}
          aria-valuenow={currentStepIndex}
          aria-valuetext={hasTrace ? `Step ${currentStepIndex + 1} of ${totalSteps}, line ${currentLine}` : 'Not run yet'}
          aria-disabled={!hasTrace}
          tabIndex={hasTrace ? 0 : -1}
          className={cx(styles.track, hasTrace && styles.active, isPlaying && styles.playing)}
          style={{ '--progress': progress } as React.CSSProperties}
          onPointerDown={handlePointerDown}
          onKeyDown={(e) => {
            if (e.key === 'ArrowRight') stepForward();
            else if (e.key === 'ArrowLeft') stepBack();
            else if (e.key === 'Home') jumpToStep(0);
            else if (e.key === 'End') jumpToStep(maxIndex);
          }}
        >
          <div className={styles.rail}>
            <div className={styles.fill} />
          </div>
          {hasTrace && <div className={styles.playhead} />}
        </div>

        {hasTrace && (
          <SegmentedControl
            size="sm"
            aria-label="Playback speed"
            className={styles.speed}
            options={SPEED_OPTIONS}
            value={speed}
            onChange={setSpeed}
          />
        )}
      </div>
    </footer>
  );
};

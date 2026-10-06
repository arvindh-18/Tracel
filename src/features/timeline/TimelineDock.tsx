import React, { useRef, useState, useCallback } from 'react';
import {
  Play,
  Pause,
  RotateCcw,
  ChevronLeft,
  ChevronRight,
  FastForward,
} from 'lucide-react';
import { useSessionStore } from '../../store/session';
import { usePlaybackStore, PlaybackSpeed } from '../../store/playback';
import { stateAt } from '../../trace/reconstruct';
import { SegmentedControl } from '../../ui/SegmentedControl';

export const TimelineDock: React.FC = () => {
  const trace = useSessionStore((s) => s.trace);

  const currentStepIndex = usePlaybackStore((s) => s.currentStepIndex);
  const isPlaying = usePlaybackStore((s) => s.isPlaying);
  const speed = usePlaybackStore((s) => s.speed);
  const play = usePlaybackStore((s) => s.play);
  const pause = usePlaybackStore((s) => s.pause);
  const togglePlay = usePlaybackStore((s) => s.togglePlay);
  const stepForward = usePlaybackStore((s) => s.stepForward);
  const stepBack = usePlaybackStore((s) => s.stepBack);
  const restart = usePlaybackStore((s) => s.restart);
  const jumpToStep = usePlaybackStore((s) => s.jumpToStep);
  const setSpeed = usePlaybackStore((s) => s.setSpeed);
  const setIsScrubbing = usePlaybackStore((s) => s.setIsScrubbing);

  const trackRef = useRef<HTMLDivElement>(null);
  const [hoverStep, setHoverStep] = useState<number | null>(null);

  const totalSteps = trace ? trace.steps.length : 0;
  const maxIndex = Math.max(0, totalSteps - 1);
  const progressPercent = maxIndex > 0 ? (currentStepIndex / maxIndex) * 100 : 0;

  const currentState = trace ? stateAt(trace, currentStepIndex) : null;
  const narration = currentState ? currentState.step.narration : '';
  const currentLine = currentState ? currentState.step.line : null;

  // Scrubber drag handler
  const handlePointerDown = (e: React.PointerEvent) => {
    if (!trackRef.current || totalSteps === 0) return;
    setIsScrubbing(true);
    e.currentTarget.setPointerCapture(e.pointerId);

    const updateFromPointer = (clientX: number) => {
      const rect = trackRef.current!.getBoundingClientRect();
      const pct = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      const targetStep = Math.round(pct * maxIndex);
      jumpToStep(targetStep);
    };

    updateFromPointer(e.clientX);

    const onPointerMove = (moveEv: PointerEvent) => {
      updateFromPointer(moveEv.clientX);
    };

    const onPointerUp = () => {
      setIsScrubbing(false);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
    };

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
  };

  const speedOptions = [
    { value: 0.5 as PlaybackSpeed, label: '0.5×' },
    { value: 1 as PlaybackSpeed, label: '1×' },
    { value: 1.5 as PlaybackSpeed, label: '1.5×' },
    { value: 2 as PlaybackSpeed, label: '2×' },
    { value: 4 as PlaybackSpeed, label: '4×' },
  ];

  return (
    <footer
      style={{
        backgroundColor: 'var(--bg-2)',
        borderTop: '1px solid var(--line-1)',
        display: 'flex',
        flexDirection: 'column',
        gap: '6px',
        padding: '8px 16px 12px 16px',
        userSelect: 'none',
        zIndex: 40,
      }}
    >
      {/* 1. Narration Row */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          fontSize: '12px',
          color: 'var(--text-1)',
          minHeight: '20px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {totalSteps > 0 && currentLine && (
            <span
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '11px',
                fontWeight: 600,
                color: 'var(--exec)',
                backgroundColor: 'var(--exec-dim)',
                padding: '1px 6px',
                borderRadius: 'var(--r-4)',
              }}
            >
              LINE {currentLine}
            </span>
          )}
          <span style={{ color: 'var(--text-2)' }}>
            {totalSteps === 0
              ? 'Ready to trace. Click Run to begin.'
              : narration || 'Executing program…'}
          </span>
        </div>

        {totalSteps > 0 && (
          <div
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: '11.5px',
              color: 'var(--text-3)',
            }}
          >
            STEP {String(currentStepIndex + 1).padStart(2, '0')} /{' '}
            {String(totalSteps).padStart(2, '0')}
          </div>
        )}
      </div>

      {/* 2. Interactive Scrubber */}
      <div
        ref={trackRef}
        role="slider"
        aria-valuemin={0}
        aria-valuemax={maxIndex}
        aria-valuenow={currentStepIndex}
        aria-valuetext={`Step ${currentStepIndex + 1} of ${totalSteps}, line ${currentLine}`}
        tabIndex={0}
        onPointerDown={handlePointerDown}
        onKeyDown={(e) => {
          if (e.key === 'ArrowRight') stepForward();
          else if (e.key === 'ArrowLeft') stepBack();
          else if (e.key === 'Home') jumpToStep(0);
          else if (e.key === 'End') jumpToStep(maxIndex);
        }}
        style={{
          height: '18px',
          display: 'flex',
          alignItems: 'center',
          position: 'relative',
          cursor: totalSteps > 0 ? 'pointer' : 'default',
        }}
      >
        {/* Scrubber Background Bar */}
        <div
          style={{
            width: '100%',
            height: '4px',
            backgroundColor: 'var(--line-2)',
            borderRadius: '2px',
            position: 'relative',
            overflow: 'hidden',
          }}
        >
          {/* Progress Fill */}
          <div
            style={{
              width: `${progressPercent}%`,
              height: '100%',
              backgroundColor: 'var(--exec)',
              transition: isPlaying ? 'width 100ms linear' : 'none',
            }}
          />
        </div>

        {/* Playhead Dot */}
        {totalSteps > 0 && (
          <div
            style={{
              position: 'absolute',
              left: `${progressPercent}%`,
              top: '50%',
              transform: 'translate(-50%, -50%)',
              width: '12px',
              height: '12px',
              borderRadius: '50%',
              backgroundColor: 'var(--exec)',
              boxShadow: '0 0 6px var(--exec-soft)',
              pointerEvents: 'none',
              transition: isPlaying ? 'left 100ms linear' : 'none',
            }}
          />
        )}
      </div>

      {/* 3. Transport Controls Row */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        {/* Playback Transport Buttons */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          {/* Restart */}
          <button
            title="Restart (R)"
            disabled={totalSteps === 0}
            onClick={restart}
            style={{
              width: '28px',
              height: '28px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: 'var(--r-6)',
              color: 'var(--text-2)',
              cursor: totalSteps === 0 ? 'not-allowed' : 'pointer',
            }}
          >
            <RotateCcw size={15} />
          </button>

          {/* Step Back */}
          <button
            title="Step Back (← or Shift+F10)"
            disabled={totalSteps === 0 || currentStepIndex === 0}
            onClick={stepBack}
            style={{
              width: '28px',
              height: '28px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: 'var(--r-6)',
              color: 'var(--text-2)',
              cursor:
                totalSteps === 0 || currentStepIndex === 0
                  ? 'not-allowed'
                  : 'pointer',
            }}
          >
            <ChevronLeft size={18} />
          </button>

          {/* Play / Pause Primary Button */}
          <button
            title={isPlaying ? 'Pause (Space)' : 'Play (Space)'}
            disabled={totalSteps === 0}
            onClick={togglePlay}
            style={{
              width: '34px',
              height: '34px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: 'var(--r-full)',
              backgroundColor: 'var(--exec)',
              color: '#1A1206',
              cursor: totalSteps === 0 ? 'not-allowed' : 'pointer',
              opacity: totalSteps === 0 ? 0.4 : 1,
              boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
            }}
          >
            {isPlaying ? (
              <Pause size={16} fill="#1A1206" />
            ) : (
              <Play size={16} fill="#1A1206" style={{ marginLeft: '2px' }} />
            )}
          </button>

          {/* Step Forward */}
          <button
            title="Step Forward (→ or F10)"
            disabled={totalSteps === 0 || currentStepIndex >= maxIndex}
            onClick={stepForward}
            style={{
              width: '28px',
              height: '28px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: 'var(--r-6)',
              color: 'var(--text-2)',
              cursor:
                totalSteps === 0 || currentStepIndex >= maxIndex
                  ? 'not-allowed'
                  : 'pointer',
            }}
          >
            <ChevronRight size={18} />
          </button>
        </div>

        {/* Speed Segmented Control */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '11px', color: 'var(--text-3)' }}>
            Speed:
          </span>
          <SegmentedControl
            size="sm"
            options={speedOptions}
            value={speed}
            onChange={(s) => setSpeed(s)}
          />
        </div>
      </div>
    </footer>
  );
};


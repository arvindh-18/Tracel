import React, { useState } from 'react';
import { useSessionStore } from '../../store/session';
import { usePlaybackStore } from '../../store/playback';
import { stateAt } from '../../trace/reconstruct';
import { FramesSection } from './sections/Frames';
import { ArrayView } from './structures/ArrayView';
import { StackView } from './structures/StackView';
import { QueueView } from './structures/QueueView';
import { LinkedListView } from './structures/LinkedListView';
import { DictView } from './structures/DictView';
import { ObjectView } from './structures/ObjectView';
import { OutputSection } from './sections/Output';
import { ErrorCard } from './sections/ErrorCard';
import { EmptyState } from './sections/EmptyState';
import { LensKind } from '../../trace/schema';

export interface LensPanelProps {
  onRun: () => void;
}

export const LensPanel: React.FC<LensPanelProps> = ({ onRun }) => {
  const trace = useSessionStore((s) => s.trace);
  const currentStepIndex = usePlaybackStore((s) => s.currentStepIndex);
  const [hoveredRefId, setHoveredRefId] = useState<string | null>(null);

  // If no trace has run yet, show the designed empty state
  if (!trace || trace.steps.length === 0) {
    return <EmptyState onRun={onRun} />;
  }

  const currentState = stateAt(trace, currentStepIndex);
  const { step, frames, heap, output, events } = currentState;

  // Identify visible heap structures referenced by visible variables
  const visibleHeapIds = new Set<string>();
  const varLabelsByHeapId = new Map<string, string>();

  for (const frame of frames) {
    for (const [name, val] of frame.locals) {
      if (val.k === 'ref' || val.k === 'ptr' || val.k === 'inline') {
        if (val.id) {
          visibleHeapIds.add(val.id);
          const existing = varLabelsByHeapId.get(val.id);
          varLabelsByHeapId.set(val.id, existing ? `${existing}, ${name}` : name);
        }
      }
    }
  }

  const heapObjects = Object.values(heap).filter((obj) => visibleHeapIds.has(obj.id));

  // Check if error step
  const activeError = step.kind === 'exception' ? trace.error : null;

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        backgroundColor: 'var(--bg-1)',
        overflowY: 'auto',
        padding: '16px',
        gap: '16px',
      }}
    >
      {/* 1. Error Card (if at exception step) */}
      {activeError && <ErrorCard error={activeError} />}

      {/* 2. Frames and Variables Section */}
      {frames.length > 0 && (
        <FramesSection
          frames={frames}
          events={events}
          onHoverRef={(id) => setHoveredRefId(id)}
        />
      )}

      {/* 3. Data Structures Section */}
      {heapObjects.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <div
            style={{
              fontSize: '11px',
              fontWeight: 600,
              color: 'var(--text-3)',
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
            }}
          >
            Structures
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {heapObjects.map((obj) => {
              const label = varLabelsByHeapId.get(obj.id);
              const lensKind: LensKind = trace.lensHints[obj.id] || 'array';
              const isHovered = hoveredRefId === obj.id;

              return (
                <div
                  key={obj.id}
                  style={{
                    boxShadow: isHovered
                      ? '0 0 0 2px var(--sem-ref), 0 0 12px var(--sem-ref-soft)'
                      : 'none',
                    borderRadius: 'var(--r-6)',
                    transition: 'box-shadow 150ms ease',
                  }}
                >
                  {lensKind === 'stack' ? (
                    <StackView
                      obj={obj}
                      label={label}
                      events={events}
                      onHoverRef={(id) => setHoveredRefId(id)}
                    />
                  ) : lensKind === 'queue' ? (
                    <QueueView
                      obj={obj}
                      label={label}
                      events={events}
                      onHoverRef={(id) => setHoveredRefId(id)}
                    />
                  ) : lensKind === 'linked_list' ? (
                    <LinkedListView
                      obj={obj}
                      allHeap={heap}
                      label={label}
                      events={events}
                      onHoverRef={(id) => setHoveredRefId(id)}
                    />
                  ) : lensKind === 'dict' ? (
                    <DictView
                      obj={obj}
                      label={label}
                      events={events}
                      onHoverRef={(id) => setHoveredRefId(id)}
                    />
                  ) : lensKind === 'object' ? (
                    <ObjectView
                      obj={obj}
                      label={label}
                      events={events}
                      onHoverRef={(id) => setHoveredRefId(id)}
                    />
                  ) : (
                    <ArrayView
                      obj={obj}
                      label={label}
                      events={events}
                      onHoverRef={(id) => setHoveredRefId(id)}
                    />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 4. Output Section (stdout) */}
      <OutputSection output={output} />
    </div>
  );
};


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
import { GridView } from './structures/GridView';
import { OutputSection } from './sections/Output';
import { ErrorCard } from './sections/ErrorCard';
import { EmptyState } from './sections/EmptyState';
import { HeapObject, LensKind } from '../../trace/schema';
import { cx } from '../../ui/cx';
import { Section } from './Section';
import styles from './LensPanel.module.css';

export const LensPanel: React.FC = () => {
  const trace = useSessionStore((s) => s.trace);
  const sessionError = useSessionStore((s) => s.error);
  const currentStepIndex = usePlaybackStore((s) => s.currentStepIndex);
  const [hoveredRefId, setHoveredRefId] = useState<string | null>(null);

  if (!trace || trace.steps.length === 0) {
    // A program rejected before it ran (parse or unsupported feature) has an error but no steps.
    if (sessionError) {
      return (
        <div className={styles.panel}>
          <ErrorCard error={sessionError} />
        </div>
      );
    }
    return <EmptyState />;
  }

  const currentState = stateAt(trace, currentStepIndex);
  const { step, frames, heap, output, events } = currentState;

  // Only show heap objects some visible variable points at.
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

  // A node some other node's `next` points at is drawn inside that list, not as a list of its own.
  const linkedTargets = new Set<string>();
  for (const obj of Object.values(heap)) {
    const next = obj.fields?.find(([name]) => name === 'next')?.[1];
    if (next && (next.k === 'ref' || next.k === 'ptr') && next.id && next.id !== obj.id) linkedTargets.add(next.id);
  }

  const heapObjects = Object.values(heap).filter(
    (obj) => visibleHeapIds.has(obj.id) && !(trace.lensHints[obj.id] === 'linked_list' && linkedTargets.has(obj.id))
  );

  const activeError = step.kind === 'exception' ? trace.error : null;

  const renderStructure = (obj: HeapObject) => {
    const props = { obj, label: varLabelsByHeapId.get(obj.id), frames, events, onHoverRef: setHoveredRefId };
    const lensKind: LensKind = trace.lensHints[obj.id] || 'array';
    switch (lensKind) {
      case 'stack':
        return <StackView {...props} />;
      case 'queue':
        return <QueueView {...props} />;
      case 'linked_list':
        return <LinkedListView {...props} allHeap={heap} />;
      case 'dict':
        return <DictView {...props} />;
      case 'object':
        return <ObjectView {...props} />;
      case 'grid':
        return <GridView {...props} allHeap={heap} />;
      default:
        return <ArrayView {...props} />;
    }
  };

  return (
    <div className={styles.panel}>
      {trace.engine === 'ai' && (
        <p className={styles.notice}>
          <strong>AI-simulated (Gemini).</strong> Gemini traced this program instead of Tracel's interpreter. AI traces can occasionally be wrong.
        </p>
      )}
      {trace.aiNotice && <p className={styles.notice}>{trace.aiNotice}</p>}
      {activeError && <ErrorCard error={activeError} />}

      {frames.length > 0 && <FramesSection frames={frames} events={events} onHoverRef={setHoveredRefId} />}

      {heapObjects.length > 0 && (
        <Section title="Data structures" count={heapObjects.length}>
          <div className={styles.structures}>
            {heapObjects.map((obj) => (
              <div key={obj.id} className={cx(styles.structure, hoveredRefId === obj.id && styles.linked)}>
                {renderStructure(obj)}
              </div>
            ))}
          </div>
        </Section>
      )}

      <OutputSection output={output} />
    </div>
  );
};

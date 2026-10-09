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
import { TreeView } from './structures/TreeView';
import { formatValue } from './structures/grammar';
import { ArrayTreeView } from './structures/ArrayTreeView';
import { useViewStore } from '../../store/views';
import own from './structures/ArrayTreeView.module.css';
import { OutputSection } from './sections/Output';
import { ErrorCard } from './sections/ErrorCard';
import { EmptyState } from './sections/EmptyState';
import { HeapObject, LensKind, Value } from '../../trace/schema';
import { cx } from '../../ui/cx';
import { Section } from './Section';
import styles from './LensPanel.module.css';

export const LensPanel: React.FC = () => {
  const trace = useSessionStore((s) => s.trace);
  const sessionError = useSessionStore((s) => s.error);
  const currentStepIndex = usePlaybackStore((s) => s.currentStepIndex);
  const [hoveredRefId, setHoveredRefId] = useState<string | null>(null);
  const layouts = useViewStore((s) => s.layouts);
  const setLayout = useViewStore((s) => s.setLayout);

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
          // The same name in several frames (recursion, this) is listed once.
          if (!existing?.split(', ').includes(name)) varLabelsByHeapId.set(val.id, existing ? `${existing}, ${name}` : name);
        }
      }
    }
  }

  // Containers held inside a visible object (this->values, self.stack) or as a map's values
  // get their own card too, labelled by the path that reaches them.
  const isContainer = (o: HeapObject | undefined) => !!o && o.kind !== 'struct' && o.kind !== 'instance' && o.kind !== 'class';
  const queue = [...visibleHeapIds];
  while (queue.length) {
    const id = queue.shift()!;
    const obj = heap[id];
    if (!obj) continue;
    const parent = varLabelsByHeapId.get(id) ?? id;
    const children: [string, Value][] = [
      ...(obj.fields ?? []).map(([f, v]) => [`${parent}${obj.kind === 'struct' ? '.' : '.'}${f}`, v] as [string, Value]),
      ...(obj.entries ?? []).map(([k, v]) => [`${parent}[${formatValue(k)}]`, v] as [string, Value]),
    ];
    for (const [path, v] of children) {
      if ((v.k === 'ref' || v.k === 'inline') && v.id && !visibleHeapIds.has(v.id) && isContainer(heap[v.id])) {
        visibleHeapIds.add(v.id);
        varLabelsByHeapId.set(v.id, path);
        queue.push(v.id);
      }
    }
  }

  // A node another node's next/left/right points at is drawn inside that list or tree, not on its own.
  const linkedTargets = new Set<string>();
  for (const obj of Object.values(heap)) {
    for (const [name, v] of obj.fields ?? []) {
      if (!['next', 'left', 'right'].includes(name.toLowerCase())) continue;
      if ((v.k === 'ref' || v.k === 'ptr') && v.id && v.id !== obj.id) linkedTargets.add(v.id);
    }
  }

  const heapObjects = Object.values(heap).filter((obj) => {
    const lens = trace.lensHints[obj.id];
    // An object with no fields (e.g. a stateless class Solution) has nothing to draw.
    if (obj.kind === 'struct' && !obj.fields?.length) return false;
    return visibleHeapIds.has(obj.id) && !((lens === 'linked_list' || lens === 'tree') && linkedTargets.has(obj.id));
  });

  // The variables the current line works with ("encountered"), highlighted in the Variables panel.
  const lineText = (trace.source.split('\n')[step.line - 1] ?? '').replace(/\/\/.*$|#.*$/, '');
  const activeNames = new Set(lineText.match(/[A-Za-z_]\w*/g) ?? []);

  // Python records a final "module returns" step after an exception; keep the card from the exception on.
  const errorAt = trace.steps.findIndex((s) => s.kind === 'exception');
  const activeError = errorAt >= 0 && step.index >= errorAt ? trace.error : null;

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
      case 'tree':
        if (obj.kind === 'struct' || obj.kind === 'instance') return <TreeView {...props} allHeap={heap} />;
        return <ArrayTreeView {...props} />;
      default: {
        // Arrays, vectors and lists can be drawn as a row or as the binary tree they encode.
        const key = `${trace.language}:${props.label ?? obj.id}`;
        // A priority queue is a binary heap, so it starts in the tree layout.
        const layout = layouts[key] ?? (obj.kind === 'cpp_priority_queue' ? 'tree' : 'array');
        const actions = (
          <span className={own.toggle} role="group" aria-label="Layout">
            {(['array', 'tree'] as const).map((l) => (
              <button key={l} type="button" aria-pressed={layout === l} onClick={() => setLayout(key, l)}>
                {l === 'array' ? 'Array' : 'Tree'}
              </button>
            ))}
          </span>
        );
        return layout === 'tree' ? <ArrayTreeView {...props} actions={actions} /> : <ArrayView {...props} actions={actions} />;
      }
    }
  };

  return (
    <div className={styles.panel}>
      {trace.engine === 'ai' && (
        <p className={styles.notice}>
          <strong>AI-simulated.</strong> Tracel's interpreter can't run this program, so Gemini traced it. AI traces can be inaccurate.
        </p>
      )}
      {trace.aiOverview && (
        <p className={styles.notice}>
          <strong>Overview.</strong> {trace.aiOverview}
        </p>
      )}
      {activeError && <ErrorCard error={activeError} />}

      {frames.length > 0 && <FramesSection frames={frames} events={events} activeNames={activeNames} onHoverRef={setHoveredRefId} />}

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

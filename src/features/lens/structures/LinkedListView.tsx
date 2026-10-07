import React from 'react';
import { motion } from 'motion/react';
import { Frame, HeapObject, TraceEvent, Value } from '../../../trace/schema';
import { motionTokens } from '../../../motion/tokens';
import { cx } from '../../../ui/cx';
import { ValueCell } from '../values/ValueCell';
import { StructureHeader } from './StructureHeader';
import { caption, pointersTo, useHistory, visitedNodes } from './grammar';
import styles from './Structure.module.css';
import own from './LinkedListView.module.css';

export interface LinkedListViewProps {
  obj: HeapObject;
  allHeap: Record<string, HeapObject>;
  label?: string;
  frames: Frame[];
  events: TraceEvent[];
  onHoverRef?: (heapId: string | null) => void;
}

const MAX_NODES = 20;

export const LinkedListView: React.FC<LinkedListViewProps> = ({ obj, allHeap, label, frames, events, onHoverRef }) => {
  const { trace, at } = useHistory();
  const chain: { id: string; val: Value }[] = [];
  const seen = new Set<string>();
  let currentId: string | null = obj.id;

  // Walk next pointers; the seen set stops cycles.
  while (currentId && !seen.has(currentId) && chain.length < MAX_NODES) {
    seen.add(currentId);
    const node: HeapObject | undefined = allHeap[currentId];
    if (!node) break;
    const fields: Map<string, Value> = new Map(node.fields ?? []);
    const val = fields.get('val') || fields.get('value') || fields.get('data') || ({ k: 'none' } as Value);
    const next: Value | undefined = fields.get('next');
    chain.push({ id: currentId, val });
    currentId = next && (next.k === 'ref' || next.k === 'ptr') ? next.id : null;
  }

  // The variables naming the list itself act as "head"; any other pointer into the chain is a walker like curr.
  const headNames = pointersTo(frames, obj.id);
  const walkers = chain.map((n) => pointersTo(frames, n.id).filter((name) => !headNames.includes(name)));
  const currentIdx = walkers.findIndex((w) => w.length > 0);
  const visited = currentIdx >= 0 ? visitedNodes(trace, at, headNames) : new Set<string>();

  return (
    <div className={styles.card}>
      <StructureHeader name={label || 'list'} meta={`linked list, ${chain.length} nodes`} caption={caption(events, obj.id)} />
      <div className={own.chain}>
        {chain.map((node, idx) => {
          const isCurrent = idx === currentIdx;
          const isVisited = !isCurrent && visited.has(node.id);
          return (
            <React.Fragment key={node.id}>
              {idx > 0 && (
                <span className={cx(own.arrow, (isCurrent || isVisited) && own.arrowLit)} aria-hidden>
                  →
                </span>
              )}
              <div className={own.column}>
                <span className={styles.label}>{idx === 0 ? 'head' : ' '}</span>
                <div className={cx(own.node, isCurrent && styles.current, isVisited && styles.visited)}>
                  <span className={own.value}>
                    <ValueCell value={node.val} onHoverRef={onHoverRef} />
                  </span>
                  <span className={own.next} aria-label="next" />
                </div>
                <div className={own.walkers}>
                  {walkers[idx]!.map((name) => (
                    <motion.span
                      key={name}
                      layoutId={`${obj.id}:${name}`}
                      transition={motionTokens.layoutSpring}
                      className={cx(styles.marker, isCurrent && styles.markerCurrent)}
                    >
                      <span aria-hidden>▲</span>
                      {name}
                    </motion.span>
                  ))}
                </div>
              </div>
            </React.Fragment>
          );
        })}
        <span className={own.arrow} aria-hidden>
          →
        </span>
        <span className={styles.null}>null</span>
      </div>
    </div>
  );
};

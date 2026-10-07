import React from 'react';
import { HeapObject, TraceEvent, Value } from '../../../trace/schema';
import { ValueCell } from '../values/ValueCell';
import { StructureHeader } from './StructureHeader';
import styles from './Structure.module.css';
import own from './LinkedListView.module.css';

export interface LinkedListViewProps {
  obj: HeapObject;
  allHeap: Record<string, HeapObject>;
  label?: string;
  events: TraceEvent[];
  onHoverRef?: (heapId: string | null) => void;
}

const MAX_NODES = 20;

export const LinkedListView: React.FC<LinkedListViewProps> = ({ obj, allHeap, label, onHoverRef }) => {
  const chain: { id: string; val: Value }[] = [];
  const visited = new Set<string>();
  let currentId: string | null = obj.id;

  // Walk next pointers; the visited set stops cycles.
  while (currentId && !visited.has(currentId) && chain.length < MAX_NODES) {
    visited.add(currentId);
    const node: HeapObject | undefined = allHeap[currentId];
    if (!node) break;
    const fields: Map<string, Value> = new Map(node.fields ?? []);
    const val = fields.get('val') || fields.get('value') || fields.get('data') || ({ k: 'none' } as Value);
    const next: Value | undefined = fields.get('next');
    chain.push({ id: currentId, val });
    currentId = next && (next.k === 'ref' || next.k === 'ptr') ? next.id : null;
  }

  return (
    <div className={styles.card}>
      <StructureHeader name={label || 'list'} meta={`linked list, ${chain.length} nodes`} />
      <div className={own.chain}>
        {chain.map((node) => (
          <React.Fragment key={node.id}>
            <div className={own.node}>
              <span className={own.value}>
                <ValueCell value={node.val} onHoverRef={onHoverRef} />
              </span>
              <span className={own.next} aria-label="next" />
            </div>
            <span className={own.arrow} aria-hidden>
              →
            </span>
          </React.Fragment>
        ))}
        <span className={own.null} title="End of list">
          null
        </span>
      </div>
    </div>
  );
};

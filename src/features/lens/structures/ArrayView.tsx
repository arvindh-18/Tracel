import React from 'react';
import { motion } from 'motion/react';
import { Frame, HeapObject, TraceEvent } from '../../../trace/schema';
import { motionTokens } from '../../../motion/tokens';
import { cx } from '../../../ui/cx';
import { ValueCell } from '../values/ValueCell';
import { StructureHeader } from './StructureHeader';
import { caption, indexCursors, useHistory, visitedIndices } from './grammar';
import styles from './Structure.module.css';

export interface ArrayViewProps {
  obj: HeapObject;
  label?: string;
  frames: Frame[];
  events: TraceEvent[];
  onHoverRef?: (heapId: string | null) => void;
}

export const ArrayView: React.FC<ArrayViewProps> = ({ obj, label, frames, events, onHoverRef }) => {
  const items = obj.items ?? [];
  const { trace, at } = useHistory();

  const changed = new Set<number>();
  for (const ev of events) {
    if (ev.type === 'item_set' && ev.id === obj.id) changed.add(ev.index);
    else if (ev.type === 'item_swap' && ev.id === obj.id) changed.add(ev.i).add(ev.j);
  }

  const cursors = indexCursors(frames, items.length);
  // Exactly one current cell: the cursor that just moved, else the first cursor.
  const moved = cursors.find((c) => events.some((e) => (e.type === 'var_update' || e.type === 'var_create') && e.name === c.name));
  const current = (moved ?? cursors[0])?.index;
  const visited = cursors.length > 0 ? visitedIndices(trace, at, items.length) : new Set<number>();

  return (
    <div className={styles.card}>
      <StructureHeader
        name={label || obj.id}
        meta={`${obj.typeName}, length ${items.length}`}
        address={obj.address}
        caption={caption(events, obj.id)}
      />
      {items.length === 0 ? (
        <div className={styles.empty}>Empty</div>
      ) : (
        <div className={styles.row}>
          {items.map((item, idx) => {
            const here = cursors.filter((c) => c.index === idx);
            return (
              <div key={idx} className={styles.slot}>
                <div className={styles.markers}>
                  {here.map((c) => (
                    // Shared layoutId makes the marker glide from its old cell to this one.
                    <motion.span
                      key={c.name}
                      layoutId={`${obj.id}:${c.name}`}
                      transition={motionTokens.layoutSpring}
                      className={cx(styles.marker, idx === current && styles.markerCurrent)}
                    >
                      {c.name}
                      <span aria-hidden>▼</span>
                    </motion.span>
                  ))}
                </div>
                <div
                  className={cx(
                    styles.cell,
                    visited.has(idx) && styles.visited,
                    changed.has(idx) ? styles.changed : idx === current && styles.current
                  )}
                >
                  <ValueCell value={item} onHoverRef={onHoverRef} />
                </div>
                <span className={cx(styles.index, idx === current && styles.indexCurrent)}>{idx}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

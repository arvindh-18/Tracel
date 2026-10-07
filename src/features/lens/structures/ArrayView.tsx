import React from 'react';
import { motion } from 'motion/react';
import { HeapObject, TraceEvent } from '../../../trace/schema';
import { motionTokens } from '../../../motion/tokens';
import { cx } from '../../../ui/cx';
import { ValueCell } from '../values/ValueCell';
import { StructureHeader } from './StructureHeader';
import styles from './Structure.module.css';

export interface ArrayViewProps {
  obj: HeapObject;
  label?: string;
  events: TraceEvent[];
  onHoverRef?: (heapId: string | null) => void;
}

export const ArrayView: React.FC<ArrayViewProps> = ({ obj, label, events, onHoverRef }) => {
  const items = obj.items ?? [];

  const changed = new Set<number>();
  for (const ev of events) {
    if (ev.type === 'item_set' && ev.id === obj.id) changed.add(ev.index);
    else if (ev.type === 'item_swap' && ev.id === obj.id) changed.add(ev.i).add(ev.j);
  }

  return (
    <div className={styles.card}>
      <StructureHeader name={label || obj.id} meta={`${obj.typeName}, length ${items.length}`} address={obj.address} />
      {items.length === 0 ? (
        <div className={styles.empty}>Empty</div>
      ) : (
        <div className={styles.row}>
          {items.map((item, idx) => (
            <motion.div key={idx} layout transition={motionTokens.layoutSpring} className={styles.slot}>
              <div className={cx(styles.cell, changed.has(idx) && styles.changed)}>
                <ValueCell value={item} onHoverRef={onHoverRef} />
              </div>
              <span className={styles.index}>{idx}</span>
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
};

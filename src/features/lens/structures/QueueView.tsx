import React from 'react';
import { motion } from 'motion/react';
import { HeapObject, TraceEvent } from '../../../trace/schema';
import { motionTokens } from '../../../motion/tokens';
import { cx } from '../../../ui/cx';
import { ValueCell } from '../values/ValueCell';
import { StructureHeader } from './StructureHeader';
import styles from './Structure.module.css';
import own from './QueueView.module.css';

export interface QueueViewProps {
  obj: HeapObject;
  label?: string;
  events: TraceEvent[];
  onHoverRef?: (heapId: string | null) => void;
}

export const QueueView: React.FC<QueueViewProps> = ({ obj, label, events, onHoverRef }) => {
  const items = obj.items ?? [];
  const enqueued = events.some((ev) => ev.type === 'item_insert' && ev.id === obj.id);

  return (
    <div className={styles.card}>
      <StructureHeader name={label || 'queue'} meta={`queue, ${items.length} items`} />
      <div className={own.lane}>
        <span className={styles.end}>Front</span>
        <div className={own.channel}>
          {items.length === 0 && <div className={styles.empty}>Empty</div>}
          {items.map((item, idx) => (
              <motion.div
                key={idx}
                layout
                transition={motionTokens.layoutSpring}
                className={cx(styles.cell, enqueued && idx === items.length - 1 && styles.added)}
              >
                <ValueCell value={item} onHoverRef={onHoverRef} />
              </motion.div>
            ))}
        </div>
        <span className={styles.end}>Rear</span>
      </div>
    </div>
  );
};

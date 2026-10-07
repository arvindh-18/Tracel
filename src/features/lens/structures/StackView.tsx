import React from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { HeapObject, TraceEvent } from '../../../trace/schema';
import { motionTokens } from '../../../motion/tokens';
import { cx } from '../../../ui/cx';
import { ValueCell } from '../values/ValueCell';
import { StructureHeader } from './StructureHeader';
import styles from './Structure.module.css';
import own from './StackView.module.css';

export interface StackViewProps {
  obj: HeapObject;
  label?: string;
  events: TraceEvent[];
  onHoverRef?: (heapId: string | null) => void;
}

export const StackView: React.FC<StackViewProps> = ({ obj, label, events, onHoverRef }) => {
  const items = obj.items ?? [];
  const pushed = events.some((ev) => ev.type === 'item_insert' && ev.id === obj.id);

  return (
    <div className={cx(styles.card, styles.narrow)}>
      <StructureHeader name={label || 'stack'} meta={`stack, ${items.length} items`} />
      <span className={styles.end}>Top</span>
      <div className={own.well}>
        {items.length === 0 && <div className={styles.empty}>Empty</div>}
        <AnimatePresence initial={false}>
          {items
            .map((item, i) => ({ item, i }))
            .reverse()
            .map(({ item, i }) => (
              // Keyed by position from the bottom, so a push adds a key instead of shifting all of them.
              <motion.div
                key={i}
                layout
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={motionTokens.layoutSpring}
                className={cx(styles.cell, styles.stretch, pushed && i === items.length - 1 && styles.added)}
              >
                <ValueCell value={item} onHoverRef={onHoverRef} />
              </motion.div>
            ))}
        </AnimatePresence>
      </div>
    </div>
  );
};

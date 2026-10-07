import React from 'react';
import { AnimatePresence } from 'motion/react';
import { Frame, HeapObject, TraceEvent } from '../../../trace/schema';
import { cx } from '../../../ui/cx';
import { ValueCell } from '../values/ValueCell';
import { StructureHeader } from './StructureHeader';
import { Leaving } from './Leaving';
import { caption } from './grammar';
import styles from './Structure.module.css';
import own from './StackView.module.css';

export interface StackViewProps {
  obj: HeapObject;
  label?: string;
  frames: Frame[];
  events: TraceEvent[];
  onHoverRef?: (heapId: string | null) => void;
}

export const StackView: React.FC<StackViewProps> = ({ obj, label, events, onHoverRef }) => {
  const items = obj.items ?? [];
  const pushed = events.some((ev) => ev.type === 'item_insert' && ev.id === obj.id);

  return (
    <div className={cx(styles.card, styles.narrow)}>
      <StructureHeader name={label || 'stack'} meta={`stack, ${items.length} items`} caption={caption(events, obj.id)} />
      <div className={own.well}>
        {items.length === 0 && <div className={styles.empty}>Empty</div>}
        <AnimatePresence initial={false}>
          {items
            .map((item, i) => ({ item, i }))
            .reverse()
            .map(({ item, i }) => {
              const isTop = i === items.length - 1;
              return (
                // Keyed by position from the bottom, so a push adds one key instead of shifting all of them.
                <Leaving key={i} exitTo="up" className={own.item}>
                  <div className={cx(styles.cell, styles.stretch, isTop && pushed && styles.added)}>
                    <ValueCell value={item} onHoverRef={onHoverRef} />
                  </div>
                  <span className={cx(styles.label, own.top, !isTop && own.hidden)}>← top</span>
                </Leaving>
              );
            })}
        </AnimatePresence>
      </div>
    </div>
  );
};

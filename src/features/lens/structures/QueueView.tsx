import React from 'react';
import { AnimatePresence } from 'motion/react';
import { Frame, HeapObject, TraceEvent } from '../../../trace/schema';
import { cx } from '../../../ui/cx';
import { ValueCell } from '../values/ValueCell';
import { StructureHeader } from './StructureHeader';
import { Leaving } from './Leaving';
import { caption, frontRemovals, useHistory } from './grammar';
import styles from './Structure.module.css';
import own from './QueueView.module.css';

export interface QueueViewProps {
  obj: HeapObject;
  label?: string;
  frames: Frame[];
  events: TraceEvent[];
  onHoverRef?: (heapId: string | null) => void;
}

export const QueueView: React.FC<QueueViewProps> = ({ obj, label, events, onHoverRef }) => {
  const items = obj.items ?? [];
  const { trace, at } = useHistory();
  const enqueued = events.some((ev) => ev.type === 'item_insert' && ev.id === obj.id && ev.index > 0);
  const pushedFront = events.some((ev) => ev.type === 'item_insert' && ev.id === obj.id && ev.index === 0);
  // Keys count from the original front, so a dequeue removes the front key and the rest keep theirs.
  const base = frontRemovals(trace, at, obj.id);

  return (
    <div className={styles.card}>
      <StructureHeader name={label || 'queue'} meta={`queue, ${items.length} items`} caption={caption(events, obj.id)} />
      <div className={own.lane}>
        <span className={own.exit} aria-label="exits at front">
          ←
        </span>
        <div className={own.channel}>
          {items.length === 0 && <div className={styles.empty}>Empty</div>}
          <AnimatePresence initial={false} mode="popLayout">
            {items.map((item, idx) => {
              const isFront = idx === 0;
              const isRear = idx === items.length - 1;
              return (
                <Leaving key={base + idx} exitTo="left" className={styles.slot}>
                  <span className={styles.label}>{isFront ? 'front' : isRear ? 'rear' : ' '}</span>
                  <div
                    className={cx(
                      styles.cell,
                      isFront && styles.current,
                      ((isRear && enqueued) || (isFront && pushedFront)) && styles.added
                    )}
                  >
                    <ValueCell value={item} onHoverRef={onHoverRef} />
                  </div>
                </Leaving>
              );
            })}
          </AnimatePresence>
        </div>
        <span className={own.entry} aria-label="enters at rear">
          ←
        </span>
      </div>
    </div>
  );
};

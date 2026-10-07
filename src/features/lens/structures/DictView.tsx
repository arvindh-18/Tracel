import React from 'react';
import { motion } from 'motion/react';
import { Frame, HeapObject, TraceEvent, Value } from '../../../trace/schema';
import { motionTokens } from '../../../motion/tokens';
import { cx } from '../../../ui/cx';
import { ValueCell } from '../values/ValueCell';
import { StructureHeader } from './StructureHeader';
import { caption, formatValue } from './grammar';
import styles from './Structure.module.css';
import own from './DictView.module.css';

export interface DictViewProps {
  obj: HeapObject;
  label?: string;
  frames: Frame[];
  events: TraceEvent[];
  onHoverRef?: (heapId: string | null) => void;
}

export const DictView: React.FC<DictViewProps> = ({ obj, label, events, onHoverRef }) => {
  const entries = obj.entries ?? [];
  const added = new Set<string>();
  const changed = new Set<string>();
  for (const ev of events) {
    if (ev.type === 'entry_set' && ev.id === obj.id) (ev.from ? changed : added).add(formatValue(ev.key));
  }
  const state = (key: Value) => {
    const k = formatValue(key);
    return added.has(k) ? styles.added : changed.has(k) ? styles.changed : undefined;
  };

  return (
    <div className={styles.card}>
      <StructureHeader name={label || 'dict'} meta={`dict, ${entries.length} keys`} caption={caption(events, obj.id)} />
      {entries.length === 0 ? (
        <div className={styles.empty}>Empty</div>
      ) : (
        <div className={own.grid}>
          {entries.map(([key, val]) => (
            <motion.div
              key={formatValue(key)}
              layout
              initial={{ opacity: 0.35 }}
              animate={{ opacity: 1 }}
              transition={motionTokens.layoutSpring}
              className={cx(own.entry, state(key))}
            >
              <ValueCell value={key} onHoverRef={onHoverRef} />
              <span className={styles.muted}>:</span>
              <ValueCell value={val} onHoverRef={onHoverRef} />
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
};

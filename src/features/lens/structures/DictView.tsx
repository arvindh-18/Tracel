import React from 'react';
import { HeapObject, TraceEvent } from '../../../trace/schema';
import { ValueCell } from '../values/ValueCell';
import { StructureHeader } from './StructureHeader';
import styles from './Structure.module.css';
import own from './DictView.module.css';

export interface DictViewProps {
  obj: HeapObject;
  label?: string;
  events: TraceEvent[];
  onHoverRef?: (heapId: string | null) => void;
}

export const DictView: React.FC<DictViewProps> = ({ obj, label, onHoverRef }) => {
  const entries = obj.entries ?? [];
  return (
    <div className={styles.card}>
      <StructureHeader name={label || 'dict'} meta={`dict, ${entries.length} keys`} />
      {entries.length === 0 ? (
        <div className={styles.empty}>Empty</div>
      ) : (
        <div className={own.grid}>
          {entries.map(([key, val], idx) => (
            <React.Fragment key={idx}>
              <ValueCell value={key} onHoverRef={onHoverRef} />
              <span className={styles.muted}>:</span>
              <ValueCell value={val} onHoverRef={onHoverRef} />
            </React.Fragment>
          ))}
        </div>
      )}
    </div>
  );
};

import React from 'react';
import { Frame, HeapObject, TraceEvent } from '../../../trace/schema';
import { Badge } from '../../../ui/Badge';
import { cx } from '../../../ui/cx';
import { ValueCell } from '../values/ValueCell';
import { StructureHeader } from './StructureHeader';
import { caption } from './grammar';
import styles from './Structure.module.css';
import own from './ObjectView.module.css';

export interface ObjectViewProps {
  obj: HeapObject;
  label?: string;
  frames: Frame[];
  events: TraceEvent[];
  onHoverRef?: (heapId: string | null) => void;
}

export const ObjectView: React.FC<ObjectViewProps> = ({ obj, label, events, onHoverRef }) => {
  const fields = obj.fields ?? [];
  const changed = new Set(
    events.flatMap((ev) => (ev.type === 'field_set' && ev.id === obj.id ? [ev.field] : []))
  );

  return (
    <div className={cx(styles.card, obj.freed && own.freed)}>
      <StructureHeader name={label || obj.id} meta={obj.typeName} address={obj.address} caption={caption(events, obj.id)}>
        {obj.freed && <Badge variant="remove">freed</Badge>}
      </StructureHeader>
      {fields.length === 0 ? (
        <div className={styles.empty}>No fields</div>
      ) : (
        <div className={own.fields}>
          {fields.map(([name, val]) => (
            <React.Fragment key={name}>
              <span className={styles.secondary}>{name}</span>
              <span className={cx(own.value, changed.has(name) && own.changed)}>
                <ValueCell value={val} onHoverRef={onHoverRef} />
              </span>
            </React.Fragment>
          ))}
        </div>
      )}
    </div>
  );
};

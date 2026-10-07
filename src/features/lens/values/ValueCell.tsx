import React from 'react';
import { Primitive, Value } from '../../../trace/schema';
import { usePrefsStore } from '../../../store/prefs';
import { cx } from '../../../ui/cx';
import styles from './ValueCell.module.css';

export const PrimitiveValue: React.FC<{ value: Primitive }> = ({ value }) => {
  switch (value.k) {
    case 'int':
    case 'float':
      return <span className={styles.number}>{value.v}</span>;
    case 'bool':
      return <span className={styles.keyword}>{value.v ? 'True' : 'False'}</span>;
    case 'str':
      return <span className={styles.string}>"{value.v}"</span>;
    case 'char':
      return <span className={styles.string}>'{String.fromCharCode(value.v)}'</span>;
    case 'none':
      return <span className={styles.none}>None</span>;
    case 'uninit':
      return (
        <span title="Uninitialized" className={styles.uninit}>
          ?
        </span>
      );
    case 'fn':
      return <span className={styles.fn}>&lt;fn {value.name}&gt;</span>;
  }
};

export interface ValueCellProps {
  value: Value;
  onHoverRef?: (heapId: string | null) => void;
}

export const ValueCell: React.FC<ValueCellProps> = ({ value, onHoverRef }) => {
  const showAddresses = usePrefsStore((s) => s.showAddresses);

  if (value.k === 'ref' || value.k === 'ptr') {
    const target = value.id;
    const text =
      value.k === 'ref' ? `ref ${value.id}` : !target ? 'nullptr' : showAddresses ? value.address : `→ ${target}`;
    return (
      <span
        className={cx(styles.ref, target && styles.linked)}
        onMouseEnter={() => target && onHoverRef?.(target)}
        onMouseLeave={() => onHoverRef?.(null)}
      >
        {value.k === 'ptr' && <span className={styles.star}>*</span>}
        {text}
      </span>
    );
  }

  if (value.k === 'inline') {
    return <span className={styles.inline}>inline {value.id}</span>;
  }

  return <PrimitiveValue value={value} />;
};

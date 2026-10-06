import React from 'react';
import { Primitive, Value } from '../../../trace/schema';

export interface PrimitiveValueProps {
  value: Primitive;
}

export const PrimitiveValue: React.FC<PrimitiveValueProps> = ({ value }) => {
  switch (value.k) {
    case 'int':
      return <span style={{ color: 'var(--syn-number)' }}>{value.v}</span>;
    case 'float':
      return <span style={{ color: 'var(--syn-number)' }}>{value.v}</span>;
    case 'bool':
      return (
        <span style={{ color: 'var(--syn-keyword)', fontWeight: 600 }}>
          {value.v ? 'True' : 'False'}
        </span>
      );
    case 'str':
      return (
        <span style={{ color: 'var(--syn-string)' }}>
          "{value.v}"
        </span>
      );
    case 'char':
      return (
        <span style={{ color: 'var(--syn-string)' }}>
          '{String.fromCharCode(value.v)}'
        </span>
      );
    case 'none':
      return (
        <span style={{ color: 'var(--text-3)', fontStyle: 'italic' }}>
          None
        </span>
      );
    case 'uninit':
      return (
        <span
          title="Uninitialized variable"
          style={{
            color: 'var(--text-4)',
            fontStyle: 'italic',
            borderBottom: '1px dashed var(--text-4)',
          }}
        >
          ?
        </span>
      );
    case 'fn':
      return (
        <span style={{ color: 'var(--syn-function)' }}>
          &lt;fn {value.name}&gt;
        </span>
      );
  }
};

export interface ValueCellProps {
  value: Value;
  onHoverRef?: (heapId: string | null) => void;
}

export const ValueCell: React.FC<ValueCellProps> = ({ value, onHoverRef }) => {
  if (value.k === 'ref') {
    return (
      <span
        onMouseEnter={() => onHoverRef && onHoverRef(value.id)}
        onMouseLeave={() => onHoverRef && onHoverRef(null)}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '4px',
          padding: '1px 6px',
          backgroundColor: 'var(--sem-ref-soft)',
          border: '1px solid var(--sem-ref-line)',
          borderRadius: 'var(--r-4)',
          color: 'var(--sem-ref)',
          fontSize: '11px',
          fontFamily: 'var(--font-mono)',
          cursor: 'pointer',
        }}
      >
        <span
          style={{
            width: '6px',
            height: '6px',
            borderRadius: '50%',
            backgroundColor: 'var(--sem-ref)',
          }}
        />
        <span>ref({value.id})</span>
      </span>
    );
  }

  if (value.k === 'ptr') {
    return (
      <span
        onMouseEnter={() => value.id && onHoverRef && onHoverRef(value.id)}
        onMouseLeave={() => onHoverRef && onHoverRef(null)}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '4px',
          padding: '1px 6px',
          backgroundColor: 'var(--sem-ref-soft)',
          border: '1px solid var(--sem-ref-line)',
          borderRadius: 'var(--r-4)',
          color: 'var(--sem-ref)',
          fontSize: '11px',
          fontFamily: 'var(--font-mono)',
          cursor: value.id ? 'pointer' : 'default',
        }}
      >
        <span style={{ fontWeight: 600 }}>*</span>
        <span>{value.id ? `${value.address}` : 'nullptr'}</span>
      </span>
    );
  }

  if (value.k === 'inline') {
    return (
      <span
        style={{
          padding: '1px 6px',
          backgroundColor: 'var(--bg-3)',
          border: '1px solid var(--line-1)',
          borderRadius: 'var(--r-4)',
          color: 'var(--text-2)',
          fontSize: '11px',
        }}
      >
        inline({value.id})
      </span>
    );
  }

  return <PrimitiveValue value={value} />;
};


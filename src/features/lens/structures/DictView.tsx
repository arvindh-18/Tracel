import React from 'react';
import { HeapObject, TraceEvent } from '../../../trace/schema';
import { ValueCell } from '../values/ValueCell';

export interface DictViewProps {
  obj: HeapObject;
  label?: string;
  events: TraceEvent[];
  onHoverRef?: (heapId: string | null) => void;
}

export const DictView: React.FC<DictViewProps> = ({
  obj,
  label,
  events,
  onHoverRef,
}) => {
  const entries = obj.entries ?? [];

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '6px',
        backgroundColor: 'var(--bg-2)',
        border: '1px solid var(--line-1)',
        borderRadius: 'var(--r-6)',
        padding: '10px',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <span
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '12.5px',
            fontWeight: 600,
            color: 'var(--text-1)',
          }}
        >
          {label || 'dict'}
        </span>
        <span style={{ fontSize: '11px', color: 'var(--text-3)' }}>
          Dict [{entries.length}]
        </span>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'auto auto 1fr',
          gap: '6px',
          alignItems: 'center',
          fontFamily: 'var(--font-mono)',
          fontSize: '12px',
        }}
      >
        {entries.length === 0 ? (
          <div
            style={{
              fontSize: '11px',
              color: 'var(--text-4)',
              fontStyle: 'italic',
              gridColumn: '1 / -1',
            }}
          >
            (empty dict)
          </div>
        ) : (
          entries.map(([key, val], idx) => (
            <React.Fragment key={idx}>
              <span style={{ color: 'var(--syn-string)' }}>
                <ValueCell value={key} onHoverRef={onHoverRef} />
              </span>
              <span style={{ color: 'var(--text-3)' }}>:</span>
              <span style={{ color: 'var(--text-1)' }}>
                <ValueCell value={val} onHoverRef={onHoverRef} />
              </span>
            </React.Fragment>
          ))
        )}
      </div>
    </div>
  );
};


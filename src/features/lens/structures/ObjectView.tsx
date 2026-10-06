import React from 'react';
import { HeapObject, TraceEvent } from '../../../trace/schema';
import { ValueCell } from '../values/ValueCell';

export interface ObjectViewProps {
  obj: HeapObject;
  label?: string;
  events: TraceEvent[];
  onHoverRef?: (heapId: string | null) => void;
}

export const ObjectView: React.FC<ObjectViewProps> = ({
  obj,
  label,
  events,
  onHoverRef,
}) => {
  const fields = obj.fields ?? [];

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '6px',
        backgroundColor: obj.freed ? 'rgba(255,255,255,0.02)' : 'var(--bg-2)',
        opacity: obj.freed ? 0.45 : 1,
        border: `1px solid ${obj.freed ? 'var(--sem-remove-line)' : 'var(--line-1)'}`,
        borderRadius: 'var(--r-6)',
        padding: '10px',
        position: 'relative',
      }}
    >
      {obj.freed && (
        <span
          style={{
            position: 'absolute',
            top: '6px',
            right: '8px',
            fontSize: '10px',
            fontWeight: 600,
            color: 'var(--sem-remove)',
            backgroundColor: 'var(--sem-remove-soft)',
            padding: '1px 5px',
            borderRadius: 'var(--r-4)',
          }}
        >
          freed
        </span>
      )}

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
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
          {label || obj.id}
        </span>
        <span style={{ fontSize: '11px', color: 'var(--text-3)' }}>
          · {obj.typeName}
        </span>
      </div>

      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '4px',
          fontFamily: 'var(--font-mono)',
          fontSize: '12px',
        }}
      >
        {fields.length === 0 ? (
          <div
            style={{
              fontSize: '11px',
              color: 'var(--text-4)',
              fontStyle: 'italic',
            }}
          >
            (no fields)
          </div>
        ) : (
          fields.map(([fieldName, val], idx) => {
            const isLast = idx === fields.length - 1;
            return (
              <div
                key={fieldName}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                }}
              >
                <span style={{ color: 'var(--text-3)', userSelect: 'none' }}>
                  {isLast ? '└─' : '├─'}
                </span>
                <span style={{ color: 'var(--text-2)', minWidth: '60px' }}>
                  {fieldName}
                </span>
                <span style={{ color: 'var(--text-1)' }}>
                  <ValueCell value={val} onHoverRef={onHoverRef} />
                </span>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};


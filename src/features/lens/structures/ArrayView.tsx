import React from 'react';
import { HeapObject, TraceEvent } from '../../../trace/schema';
import { ValueCell } from '../values/ValueCell';

export interface ArrayViewProps {
  obj: HeapObject;
  label?: string;
  events: TraceEvent[];
  onHoverRef?: (heapId: string | null) => void;
}

export const ArrayView: React.FC<ArrayViewProps> = ({
  obj,
  label,
  events,
  onHoverRef,
}) => {
  const items = obj.items ?? [];

  // Determine which indices were modified in current step
  const modifiedIndices = new Set<number>();
  const swappedIndices = new Set<number>();

  for (const ev of events) {
    if (ev.type === 'item_set' && ev.id === obj.id) {
      modifiedIndices.add(ev.index);
    } else if (ev.type === 'item_swap' && ev.id === obj.id) {
      swappedIndices.add(ev.i);
      swappedIndices.add(ev.j);
    }
  }

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
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
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
            {obj.typeName} [{items.length}]
          </span>
          {obj.address && (
            <span
              style={{
                fontFamily: 'var(--font-mono)',
                fontSize: '10.5px',
                color: 'var(--text-3)',
              }}
            >
              @{obj.address}
            </span>
          )}
        </div>
      </div>

      {/* Array Cells */}
      <div
        style={{
          display: 'flex',
          gap: '2px',
          overflowX: 'auto',
          paddingBottom: '4px',
        }}
      >
        {items.length === 0 ? (
          <div
            style={{
              fontSize: '11.5px',
              color: 'var(--text-4)',
              fontStyle: 'italic',
              padding: '6px 0',
            }}
          >
            (empty array)
          </div>
        ) : (
          items.map((item, idx) => {
            const isModified = modifiedIndices.has(idx);
            const isSwapped = swappedIndices.has(idx);

            return (
              <div
                key={idx}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  minWidth: '42px',
                }}
              >
                {/* Value Cell */}
                <div
                  style={{
                    width: '100%',
                    height: '32px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: isModified || isSwapped
                      ? 'var(--exec-soft)'
                      : 'var(--bg-3)',
                    border: `1px solid ${
                      isModified || isSwapped
                        ? 'var(--exec)'
                        : 'var(--line-2)'
                    }`,
                    borderRadius: 'var(--r-4)',
                    fontFamily: 'var(--font-mono)',
                    fontSize: '12px',
                    color: 'var(--text-1)',
                    transition:
                      'background-color 900ms ease, border-color 900ms ease',
                    boxShadow: isModified || isSwapped
                      ? '0 0 6px var(--exec-soft)'
                      : 'none',
                  }}
                >
                  <ValueCell value={item} onHoverRef={onHoverRef} />
                </div>

                {/* Index label */}
                <span
                  style={{
                    fontSize: '10.5px',
                    fontFamily: 'var(--font-mono)',
                    color: isModified || isSwapped
                      ? 'var(--exec)'
                      : 'var(--text-3)',
                    marginTop: '3px',
                  }}
                >
                  {idx}
                </span>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};


import React from 'react';
import { HeapObject, TraceEvent } from '../../../trace/schema';
import { ValueCell } from '../values/ValueCell';

export interface QueueViewProps {
  obj: HeapObject;
  label?: string;
  events: TraceEvent[];
  onHoverRef?: (heapId: string | null) => void;
}

export const QueueView: React.FC<QueueViewProps> = ({
  obj,
  label,
  events,
  onHoverRef,
}) => {
  const items = obj.items ?? [];

  let isEnqueued = false;
  let isDequeued = false;

  for (const ev of events) {
    if (ev.type === 'item_insert' && ev.id === obj.id) isEnqueued = true;
    if (ev.type === 'item_remove' && ev.id === obj.id) isDequeued = true;
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
          {label || 'queue'}
        </span>
        <span style={{ fontSize: '11px', color: 'var(--text-3)' }}>
          Queue [{items.length}]
        </span>
      </div>

      {/* Queue Channel */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          padding: '6px 0',
        }}
      >
        <span
          style={{
            fontSize: '10px',
            fontFamily: 'var(--font-mono)',
            fontWeight: 600,
            color: 'var(--sem-call)',
            whiteSpace: 'nowrap',
          }}
        >
          FRONT →
        </span>

        <div
          style={{
            display: 'flex',
            gap: '3px',
            borderTop: '2px solid var(--line-2)',
            borderBottom: '2px solid var(--line-2)',
            padding: '4px 6px',
            minWidth: '120px',
            overflowX: 'auto',
          }}
        >
          {items.length === 0 ? (
            <div
              style={{
                fontSize: '11px',
                color: 'var(--text-4)',
                fontStyle: 'italic',
                padding: '4px 8px',
              }}
            >
              (empty queue)
            </div>
          ) : (
            items.map((item, idx) => {
              const isRear = idx === items.length - 1;
              return (
                <div
                  key={idx}
                  style={{
                    minWidth: '38px',
                    height: '30px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: isRear && isEnqueued
                      ? 'var(--sem-create-soft)'
                      : 'var(--bg-3)',
                    border: `1px solid ${
                      isRear && isEnqueued
                        ? 'var(--sem-create)'
                        : 'var(--line-2)'
                    }`,
                    borderRadius: 'var(--r-4)',
                    fontSize: '12px',
                    fontFamily: 'var(--font-mono)',
                    color: 'var(--text-1)',
                    transition: 'all 200ms ease',
                  }}
                >
                  <ValueCell value={item} onHoverRef={onHoverRef} />
                </div>
              );
            })
          )}
        </div>

        <span
          style={{
            fontSize: '10px',
            fontFamily: 'var(--font-mono)',
            fontWeight: 600,
            color: 'var(--exec)',
            whiteSpace: 'nowrap',
          }}
        >
          ← REAR
        </span>
      </div>
    </div>
  );
};


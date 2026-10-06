import React from 'react';
import { HeapObject, TraceEvent } from '../../../trace/schema';
import { ValueCell } from '../values/ValueCell';

export interface StackViewProps {
  obj: HeapObject;
  label?: string;
  events: TraceEvent[];
  onHoverRef?: (heapId: string | null) => void;
}

export const StackView: React.FC<StackViewProps> = ({
  obj,
  label,
  events,
  onHoverRef,
}) => {
  const items = obj.items ?? [];
  // For stack, top element is the last element of items
  const reversedItems = [...items].reverse();

  let isPushed = false;
  let isPopped = false;

  for (const ev of events) {
    if (ev.type === 'item_insert' && ev.id === obj.id) isPushed = true;
    if (ev.type === 'item_remove' && ev.id === obj.id) isPopped = true;
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
        width: 'fit-content',
        minWidth: '160px',
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
          {label || 'stack'}
        </span>
        <span style={{ fontSize: '11px', color: 'var(--text-3)' }}>
          Stack [{items.length}]
        </span>
      </div>

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '4px',
          fontSize: '10.5px',
          color: 'var(--exec)',
          fontWeight: 600,
          letterSpacing: '0.04em',
        }}
      >
        <span>TOP ↓</span>
      </div>

      {/* Vertical Stack Slots */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '4px',
          borderLeft: '2px solid var(--line-2)',
          borderRight: '2px solid var(--line-2)',
          borderBottom: '2px solid var(--line-2)',
          borderRadius: '0 0 var(--r-4) var(--r-4)',
          padding: '4px',
          minHeight: '80px',
          justifyContent: 'flex-end',
        }}
      >
        {reversedItems.length === 0 ? (
          <div
            style={{
              fontSize: '11px',
              color: 'var(--text-4)',
              textAlign: 'center',
              padding: '12px 0',
              fontStyle: 'italic',
            }}
          >
            (empty stack)
          </div>
        ) : (
          reversedItems.map((item, idx) => {
            const isTopItem = idx === 0;
            return (
              <div
                key={idx}
                style={{
                  height: '28px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: isTopItem && isPushed
                    ? 'var(--sem-create-soft)'
                    : 'var(--bg-3)',
                  border: `1px solid ${
                    isTopItem && isPushed
                      ? 'var(--sem-create)'
                      : 'var(--line-2)'
                  }`,
                  borderRadius: 'var(--r-4)',
                  fontSize: '12px',
                  fontFamily: 'var(--font-mono)',
                  color: 'var(--text-1)',
                  transition: 'all 220ms cubic-bezier(0.2, 0, 0, 1)',
                }}
              >
                <ValueCell value={item} onHoverRef={onHoverRef} />
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};


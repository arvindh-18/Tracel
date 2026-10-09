import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
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
        gap: '8px',
        backgroundColor: 'var(--bg-2)',
        border: '1px solid var(--line-1)',
        borderRadius: 'var(--r-8)',
        padding: '12px',
        width: 'fit-content',
        minWidth: '180px',
        boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
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
        <span
          style={{
            fontSize: '11px',
            color: 'var(--text-3)',
            backgroundColor: 'var(--bg-3)',
            padding: '1px 6px',
            borderRadius: 'var(--r-4)',
            border: '1px solid var(--line-1)',
          }}
        >
          Stack [{items.length}]
        </span>
      </div>

      {/* TOP indicator banner */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '4px',
          fontSize: '11px',
          color: 'var(--exec)',
          fontWeight: 600,
          letterSpacing: '0.06em',
        }}
      >
        <span>TOP ↓</span>
      </div>

      {/* Vertical Container Slot with Flow-In / Flow-Out */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '5px',
          borderLeft: '2px solid var(--line-2)',
          borderRight: '2px solid var(--line-2)',
          borderBottom: '2px solid var(--line-2)',
          borderRadius: '0 0 var(--r-6) var(--r-6)',
          padding: '6px',
          minHeight: '100px',
          justifyContent: 'flex-end',
          backgroundColor: 'rgba(0,0,0,0.15)',
        }}
      >
        <AnimatePresence mode="popLayout" initial={false}>
          {reversedItems.length === 0 ? (
            <motion.div
              key="empty"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              style={{
                fontSize: '11.5px',
                color: 'var(--text-4)',
                textAlign: 'center',
                padding: '18px 0',
                fontStyle: 'italic',
              }}
            >
              (empty stack)
            </motion.div>
          ) : (
            reversedItems.map((item, idx) => {
              const isTopItem = idx === 0;
              const originalIndex = items.length - 1 - idx;

              return (
                <motion.div
                  key={`${obj.id}-slot-${originalIndex}`}
                  layout
                  initial={{ opacity: 0, y: -35, scale: 0.85 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -35, scale: 0.85 }}
                  transition={{
                    type: 'spring',
                    stiffness: 480,
                    damping: 32,
                    mass: 0.85,
                  }}
                  style={{
                    height: '32px',
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
                    borderRadius: 'var(--r-6)',
                    fontSize: '12.5px',
                    fontFamily: 'var(--font-mono)',
                    color: 'var(--text-1)',
                    boxShadow: isTopItem && isPushed
                      ? '0 0 8px var(--sem-create-soft)'
                      : '0 1px 3px rgba(0,0,0,0.3)',
                    transition:
                      'background-color 400ms ease, border-color 400ms ease, box-shadow 400ms ease',
                  }}
                >
                  <ValueCell value={item} onHoverRef={onHoverRef} />
                </motion.div>
              );
            })
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};

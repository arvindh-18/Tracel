import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
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
        gap: '8px',
        backgroundColor: 'var(--bg-2)',
        border: '1px solid var(--line-1)',
        borderRadius: 'var(--r-8)',
        padding: '12px',
        boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
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
          Queue [{items.length}]
        </span>
      </div>

      {/* Queue Channel with Flow-In / Flow-Out */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          padding: '6px 0',
        }}
      >
        <span
          style={{
            fontSize: '11px',
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
            gap: '6px',
            borderTop: '2px solid var(--line-2)',
            borderBottom: '2px solid var(--line-2)',
            padding: '6px 8px',
            minWidth: '160px',
            overflowX: 'auto',
            backgroundColor: 'rgba(0,0,0,0.15)',
            borderRadius: 'var(--r-4)',
          }}
        >
          <AnimatePresence mode="popLayout" initial={false}>
            {items.length === 0 ? (
              <motion.div
                key="empty"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                style={{
                  fontSize: '11.5px',
                  color: 'var(--text-4)',
                  fontStyle: 'italic',
                  padding: '6px 12px',
                }}
              >
                (empty queue)
              </motion.div>
            ) : (
              items.map((item, idx) => {
                const isRear = idx === items.length - 1;

                return (
                  <motion.div
                    key={`${obj.id}-item-${idx}`}
                    layout
                    initial={{ opacity: 0, x: 45, scale: 0.8 }}
                    animate={{ opacity: 1, x: 0, scale: 1 }}
                    exit={{ opacity: 0, x: -45, scale: 0.8 }}
                    transition={{
                      type: 'spring',
                      stiffness: 450,
                      damping: 32,
                      mass: 0.8,
                    }}
                    style={{
                      minWidth: '44px',
                      height: '34px',
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
                      borderRadius: 'var(--r-6)',
                      fontSize: '12.5px',
                      fontFamily: 'var(--font-mono)',
                      color: 'var(--text-1)',
                      boxShadow: isRear && isEnqueued
                        ? '0 0 8px var(--sem-create-soft)'
                        : '0 1px 3px rgba(0,0,0,0.25)',
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

        <span
          style={{
            fontSize: '11px',
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

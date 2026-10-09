import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
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
        gap: '8px',
        backgroundColor: 'var(--bg-2)',
        border: '1px solid var(--line-1)',
        borderRadius: 'var(--r-8)',
        padding: '12px',
        boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
      }}
    >
      {/* Container Header */}
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

      {/* Array Element Blocks with Flow-In / Flow-Out */}
      <div
        style={{
          display: 'flex',
          gap: '4px',
          overflowX: 'auto',
          padding: '6px 2px',
          minHeight: '62px',
          alignItems: 'flex-start',
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
                padding: '8px 0',
              }}
            >
              (empty array)
            </motion.div>
          ) : (
            items.map((item, idx) => {
              const isModified = modifiedIndices.has(idx);
              const isSwapped = swappedIndices.has(idx);

              return (
                <motion.div
                  key={`${obj.id}-item-${idx}`}
                  layout
                  initial={{ opacity: 0, scale: 0.75, y: 12 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.75, y: -12 }}
                  transition={{
                    type: 'spring',
                    stiffness: 420,
                    damping: 32,
                    mass: 0.8,
                  }}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    minWidth: '44px',
                  }}
                >
                  {/* Distinct Physical Element Block */}
                  <motion.div
                    animate={{
                      scale: isModified || isSwapped ? [1, 1.08, 1] : 1,
                    }}
                    transition={{ duration: 0.35, ease: 'easeOut' }}
                    style={{
                      width: '100%',
                      height: '36px',
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
                      borderRadius: 'var(--r-6)',
                      fontFamily: 'var(--font-mono)',
                      fontSize: '12.5px',
                      color: 'var(--text-1)',
                      boxShadow: isModified || isSwapped
                        ? '0 0 8px var(--exec-soft)'
                        : '0 1px 3px rgba(0,0,0,0.25)',
                      transition:
                        'background-color 500ms ease, border-color 500ms ease, box-shadow 500ms ease',
                    }}
                  >
                    <ValueCell value={item} onHoverRef={onHoverRef} />
                  </motion.div>

                  {/* Index Label */}
                  <span
                    style={{
                      fontSize: '10.5px',
                      fontFamily: 'var(--font-mono)',
                      color: isModified || isSwapped
                        ? 'var(--exec)'
                        : 'var(--text-3)',
                      marginTop: '4px',
                      fontWeight: isModified || isSwapped ? 600 : 400,
                    }}
                  >
                    {idx}
                  </span>
                </motion.div>
              );
            })
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};

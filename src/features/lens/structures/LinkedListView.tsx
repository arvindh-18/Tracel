import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { HeapObject, TraceEvent, Value } from '../../../trace/schema';
import { ValueCell } from '../values/ValueCell';

export interface LinkedListViewProps {
  obj: HeapObject;
  allHeap: Record<string, HeapObject>;
  label?: string;
  events: TraceEvent[];
  onHoverRef?: (heapId: string | null) => void;
}

export const LinkedListView: React.FC<LinkedListViewProps> = ({
  obj,
  allHeap,
  label,
  events,
  onHoverRef,
}) => {
  // Follow next pointers to build the list chain
  const chain: { id: string; val: Value; nextId: string | null }[] = [];
  const visited = new Set<string>();
  let currentId: string | null = obj.id;

  while (currentId && !visited.has(currentId) && chain.length < 20) {
    visited.add(currentId);
    const nodeObj: HeapObject | undefined = allHeap[currentId];
    if (!nodeObj) break;

    const fields: Map<string, Value> = new Map(nodeObj.fields ?? []);
    const valField: Value =
      fields.get('val') ||
      fields.get('value') ||
      fields.get('data') ||
      ({ k: 'none' } as Value);
    const nextField: Value | undefined = fields.get('next');

    let nextTargetId: string | null = null;
    if (nextField && (nextField.k === 'ref' || nextField.k === 'ptr')) {
      nextTargetId = nextField.id;
    }

    chain.push({
      id: currentId,
      val: valField,
      nextId: nextTargetId,
    });

    currentId = nextTargetId;
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
          {label || 'linked_list'}
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
          Linked List [{chain.length} nodes]
        </span>
      </div>

      {/* Nodes Row with Flow-In / Flow-Out */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          overflowX: 'auto',
          padding: '8px 2px',
        }}
      >
        <AnimatePresence mode="popLayout" initial={false}>
          {chain.map((node, idx) => (
            <motion.div
              key={node.id}
              layout
              initial={{ opacity: 0, scale: 0.8, x: 25 }}
              animate={{ opacity: 1, scale: 1, x: 0 }}
              exit={{ opacity: 0, scale: 0.8, x: -25 }}
              transition={{
                type: 'spring',
                stiffness: 450,
                damping: 32,
                mass: 0.8,
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              {/* Node Element Block */}
              <div
                style={{
                  display: 'flex',
                  border: '1px solid var(--line-2)',
                  borderRadius: 'var(--r-6)',
                  backgroundColor: 'var(--bg-3)',
                  overflow: 'hidden',
                  fontFamily: 'var(--font-mono)',
                  fontSize: '12.5px',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.25)',
                }}
              >
                {/* Value Cell */}
                <div
                  style={{
                    padding: '6px 10px',
                    borderRight: '1px solid var(--line-2)',
                    color: 'var(--text-1)',
                    display: 'flex',
                    alignItems: 'center',
                  }}
                >
                  <ValueCell value={node.val} onHoverRef={onHoverRef} />
                </div>
                {/* Pointer Dot Cell */}
                <div
                  style={{
                    padding: '6px 8px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: 'var(--bg-4)',
                  }}
                >
                  <span
                    style={{
                      width: '7px',
                      height: '7px',
                      borderRadius: '50%',
                      backgroundColor: 'var(--sem-ref)',
                      boxShadow: '0 0 4px var(--sem-ref-soft)',
                    }}
                  />
                </div>
              </div>

              {/* Connecting Flow Arrow */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  color: 'var(--sem-ref)',
                  fontSize: '16px',
                  padding: '0 2px',
                  userSelect: 'none',
                }}
              >
                →
              </div>
            </motion.div>
          ))}
        </AnimatePresence>

        {/* Null Terminator Block */}
        <div
          title="nullptr / None"
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '14px',
            color: 'var(--text-3)',
            fontWeight: 'bold',
            padding: '4px 8px',
            backgroundColor: 'var(--bg-3)',
            border: '1px solid var(--line-1)',
            borderRadius: 'var(--r-4)',
          }}
        >
          ⊥
        </div>
      </div>
    </div>
  );
};

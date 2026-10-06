import React from 'react';
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
          {label || 'linked_list'}
        </span>
        <span style={{ fontSize: '11px', color: 'var(--text-3)' }}>
          Linked List [{chain.length} nodes]
        </span>
      </div>

      {/* Nodes Row */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '4px',
          overflowX: 'auto',
          padding: '8px 0',
        }}
      >
        {chain.map((node, idx) => (
          <React.Fragment key={node.id}>
            {/* Node Box */}
            <div
              style={{
                display: 'flex',
                border: '1px solid var(--line-2)',
                borderRadius: 'var(--r-4)',
                backgroundColor: 'var(--bg-3)',
                overflow: 'hidden',
                fontFamily: 'var(--font-mono)',
                fontSize: '12px',
              }}
            >
              {/* Value side */}
              <div
                style={{
                  padding: '4px 8px',
                  borderRight: '1px solid var(--line-2)',
                  color: 'var(--text-1)',
                }}
              >
                <ValueCell value={node.val} onHoverRef={onHoverRef} />
              </div>
              {/* Pointer dot side */}
              <div
                style={{
                  padding: '4px 6px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: 'var(--bg-4)',
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
              </div>
            </div>

            {/* Connecting Arrow */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                color: 'var(--sem-ref)',
                fontSize: '14px',
                padding: '0 2px',
              }}
            >
              →
            </div>
          </React.Fragment>
        ))}

        {/* Null Terminator */}
        <div
          title="nullptr / None"
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '13px',
            color: 'var(--text-3)',
            fontWeight: 'bold',
            padding: '2px 4px',
          }}
        >
          ⊥
        </div>
      </div>
    </div>
  );
};

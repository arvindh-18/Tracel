import React from 'react';
import { motion } from 'motion/react';
import { Frame, HeapObject, TraceEvent } from '../../../trace/schema';
import { motionTokens } from '../../../motion/tokens';
import { cx } from '../../../ui/cx';
import { ValueCell } from '../values/ValueCell';
import { StructureHeader } from './StructureHeader';
import { caption, indexCursors, subscriptNames, useHistory, visitedIndices } from './grammar';
import styles from './Structure.module.css';
import own from './ArrayTreeView.module.css';

export interface ArrayTreeViewProps {
  obj: HeapObject;
  label?: string;
  frames: Frame[];
  events: TraceEvent[];
  onHoverRef?: (heapId: string | null) => void;
  actions?: React.ReactNode;
}

const SLOT = 56; // width per leaf
const LEVEL = 72; // height per level
const TOP = 26; // room for cursor markers above the root

/**
 * An array drawn as the binary tree it encodes: index i has children 2i+1 and
 * 2i+2 (the layout of a binary heap or a complete tree stored in an array).
 */
export const ArrayTreeView: React.FC<ArrayTreeViewProps> = ({ obj, label, frames, events, onHoverRef, actions }) => {
  const items = obj.items ?? [];
  const { trace, at } = useHistory();
  const depth = items.length ? Math.floor(Math.log2(items.length)) + 1 : 0;
  const width = Math.max(1, 2 ** Math.max(0, depth - 1)) * SLOT;
  const height = TOP + depth * LEVEL;

  const pos = (i: number) => {
    const d = Math.floor(Math.log2(i + 1));
    const p = i - (2 ** d - 1);
    return { x: ((p + 0.5) * width) / 2 ** d, y: TOP + d * LEVEL + 18 };
  };

  const changed = new Set<number>();
  let inserted = -1;
  for (const ev of events) {
    if (!('id' in ev) || ev.id !== obj.id) continue;
    if (ev.type === 'item_set') changed.add(ev.index);
    else if (ev.type === 'item_swap') changed.add(ev.i).add(ev.j);
    else if (ev.type === 'item_insert') inserted = ev.index;
  }
  const cursors = indexCursors(frames, items.length, obj.id, subscriptNames(trace?.source));
  const moved = cursors.find((c) => events.some((e) => (e.type === 'var_update' || e.type === 'var_create') && e.name === c.name));
  const current = (moved ?? cursors[0])?.index;
  const visited = cursors.length > 0 ? visitedIndices(trace, at, items.length, obj.id) : new Set<number>();

  return (
    <div className={styles.card}>
      <StructureHeader name={label || obj.id} meta={`${obj.typeName} as a tree, ${items.length} nodes`} address={obj.address} caption={caption(events, obj.id)}>
        {actions}
      </StructureHeader>
      {items.length === 0 ? (
        <div className={styles.empty}>Empty</div>
      ) : (
        <div className={own.scroll}>
          <div className={own.canvas} style={{ width, height }}>
            <svg className={own.edges} width={width} height={height} aria-hidden>
              {items.map((_, i) => {
                if (i === 0) return null;
                const a = pos(Math.floor((i - 1) / 2));
                const b = pos(i);
                const lit = visited.has(i) || i === current;
                return <line key={i} x1={a.x} y1={a.y} x2={b.x} y2={b.y} className={cx(own.edge, lit && own.edgeLit)} />;
              })}
            </svg>
            {items.map((item, i) => {
              const { x, y } = pos(i);
              const here = cursors.filter((c) => c.index === i);
              return (
                <div key={i} className={own.node} style={{ left: x, top: y }}>
                  <div className={own.markers}>
                    {here.map((c) => (
                      <motion.span
                        key={c.name}
                        layoutId={`${obj.id}:tree:${c.name}`}
                        transition={motionTokens.layoutSpring}
                        className={cx(styles.marker, i === current && styles.markerCurrent)}
                      >
                        {c.name}
                        <span aria-hidden>▼</span>
                      </motion.span>
                    ))}
                  </div>
                  <motion.div
                    initial={i === inserted ? { scale: 0.4, opacity: 0 } : false}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={motionTokens.layoutSpring}
                    className={cx(
                      styles.cell,
                      own.circle,
                      visited.has(i) && styles.visited,
                      i === inserted ? styles.added : changed.has(i) ? styles.changed : i === current && styles.current
                    )}
                  >
                    <ValueCell value={item} onHoverRef={onHoverRef} />
                  </motion.div>
                  <span className={cx(styles.index, i === current && styles.indexCurrent)}>{i}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

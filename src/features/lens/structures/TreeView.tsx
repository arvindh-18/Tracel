import React from 'react';
import { motion } from 'motion/react';
import { Frame, HeapObject, TraceEvent, Value } from '../../../trace/schema';
import { motionTokens } from '../../../motion/tokens';
import { cx } from '../../../ui/cx';
import { ValueCell } from '../values/ValueCell';
import { StructureHeader } from './StructureHeader';
import { caption, pointersTo, useHistory, visitedNodes } from './grammar';
import styles from './Structure.module.css';
import own from './ArrayTreeView.module.css';

export interface TreeViewProps {
  obj: HeapObject;
  allHeap: Record<string, HeapObject>;
  label?: string;
  frames: Frame[];
  events: TraceEvent[];
  onHoverRef?: (heapId: string | null) => void;
}

const SLOT = 56;
const LEVEL = 72;
const TOP = 26;
const MAX_NODES = 63;

const field = (node: HeapObject, names: string[]): Value | undefined =>
  node.fields?.find(([n]) => names.includes(n.toLowerCase()))?.[1];
const childId = (v: Value | undefined) => (v && (v.k === 'ref' || v.k === 'ptr') && v.id ? v.id : null);

/** A binary tree of linked nodes (left/right pointers), laid out in order. */
export const TreeView: React.FC<TreeViewProps> = ({ obj, allHeap, label, frames, events, onHoverRef }) => {
  const { trace, at } = useHistory();
  type Placed = { id: string; node: HeapObject; x: number; depth: number; parent: string | null };
  const placed: Placed[] = [];
  const seen = new Set<string>();
  let column = 0;
  let maxDepth = 0;

  // In-order walk: x is the in-order position, y the depth. The seen set stops cycles.
  const walk = (id: string | null, depth: number, parent: string | null) => {
    if (!id || seen.has(id) || placed.length >= MAX_NODES) return;
    const node = allHeap[id];
    if (!node) return;
    seen.add(id);
    walk(childId(field(node, ['left'])), depth + 1, id);
    placed.push({ id, node, x: column++, depth, parent });
    maxDepth = Math.max(maxDepth, depth);
    walk(childId(field(node, ['right'])), depth + 1, id);
  };
  walk(obj.id, 0, null);

  const width = Math.max(1, column) * SLOT;
  const height = TOP + (maxDepth + 1) * LEVEL;
  const pos = new Map(placed.map((p) => [p.id, { x: p.x * SLOT + SLOT / 2, y: TOP + p.depth * LEVEL + 18 }]));

  const rootNames = pointersTo(frames, obj.id);
  const walkers = new Map(placed.map((p) => [p.id, pointersTo(frames, p.id).filter((n) => !rootNames.includes(n) || p.id !== obj.id)]));
  const current = placed.find((p) => p.id !== obj.id && (walkers.get(p.id)?.length ?? 0) > 0)?.id;
  const visited = current ? visitedNodes(trace, at, rootNames) : new Set<string>();
  const changed = new Set(events.flatMap((e) => (e.type === 'field_set' ? [e.id] : [])));
  const created = new Set(events.flatMap((e) => (e.type === 'obj_create' ? [e.id] : [])));

  return (
    <div className={styles.card}>
      <StructureHeader name={label || obj.id} meta={`binary tree, ${placed.length} nodes`} caption={caption(events, obj.id)} />
      <div className={own.scroll}>
        <div className={own.canvas} style={{ width, height }}>
          <svg className={own.edges} width={width} height={height} aria-hidden>
            {placed.map((p) => {
              if (!p.parent) return null;
              const a = pos.get(p.parent)!;
              const b = pos.get(p.id)!;
              const lit = visited.has(p.id) || p.id === current;
              return <line key={p.id} x1={a.x} y1={a.y} x2={b.x} y2={b.y} className={cx(own.edge, lit && own.edgeLit)} />;
            })}
          </svg>
          {placed.map((p) => {
            const { x, y } = pos.get(p.id)!;
            const value = field(p.node, ['val', 'value', 'data', 'key']) ?? ({ k: 'none' } as Value);
            const names = walkers.get(p.id) ?? [];
            return (
              <div key={p.id} className={own.node} style={{ left: x, top: y }}>
                <div className={own.markers}>
                  {names.map((n) => (
                    <motion.span
                      key={n}
                      layoutId={`${obj.id}:node:${n}`}
                      transition={motionTokens.layoutSpring}
                      className={cx(styles.marker, p.id === current && styles.markerCurrent)}
                    >
                      {n}
                      <span aria-hidden>▼</span>
                    </motion.span>
                  ))}
                </div>
                <motion.div
                  initial={created.has(p.id) ? { scale: 0.4, opacity: 0 } : false}
                  animate={{ scale: 1, opacity: p.node.freed ? 0.45 : 1 }}
                  transition={motionTokens.layoutSpring}
                  title={p.node.freed ? 'freed' : undefined}
                  className={cx(
                    styles.cell,
                    own.circle,
                    visited.has(p.id) && styles.visited,
                    created.has(p.id) ? styles.added : changed.has(p.id) ? styles.changed : p.id === current && styles.current,
                    p.node.freed && styles.removing
                  )}
                >
                  <ValueCell value={value} onHoverRef={onHoverRef} />
                </motion.div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

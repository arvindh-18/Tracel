import React from 'react';
import { AnimatePresence, motion, useIsPresent } from 'motion/react';
import { Frame, HeapObject, TraceEvent } from '../../../trace/schema';
import { motionTokens } from '../../../motion/tokens';
import { cx } from '../../../ui/cx';
import { ValueCell } from '../values/ValueCell';
import { StructureHeader } from './StructureHeader';
import { caption, indexCursors, subscriptNames, useHistory, visitedIndices } from './grammar';
import styles from './Structure.module.css';

export interface ArrayViewProps {
  obj: HeapObject;
  label?: string;
  frames: Frame[];
  events: TraceEvent[];
  onHoverRef?: (heapId: string | null) => void;
  /** Extra controls for the header, e.g. the Array | Tree switch. */
  actions?: React.ReactNode;
}

// Growing containers get a springier entrance than the layout spring: the new
// cell overshoots slightly as it lands, so a push reads as motion, not a swap.
const LAND_SPRING = { type: 'spring' as const, stiffness: 520, damping: 24, mass: 0.8 };

/** One slot of a growable container: flies in on push, lifts out (after turning red) on pop. */
const Slot: React.FC<{ pushed: boolean; children: React.ReactNode }> = ({ pushed, children }) => {
  const present = useIsPresent();
  return (
    <motion.div
      layout
      className={cx(styles.slot, !present && styles.leaving)}
      initial={pushed ? { opacity: 0, x: 56, y: -28, scale: 0.55, rotate: 8 } : false}
      animate={{ opacity: 1, x: 0, y: 0, scale: 1, rotate: 0 }}
      exit={{
        opacity: 0,
        y: -24,
        scale: 0.6,
        transition: { delay: motionTokens.duration.base, duration: motionTokens.duration.base },
      }}
      transition={pushed ? LAND_SPRING : motionTokens.layoutSpring}
    >
      {children}
    </motion.div>
  );
};

export const ArrayView: React.FC<ArrayViewProps> = ({ obj, label, frames, events, onHoverRef, actions }) => {
  const items = obj.items ?? [];
  const { trace, at } = useHistory();

  const changed = new Set<number>();
  for (const ev of events) {
    if (ev.type === 'item_set' && ev.id === obj.id) changed.add(ev.index);
    else if (ev.type === 'item_swap' && ev.id === obj.id) changed.add(ev.i).add(ev.j);
  }

  // Vectors and lists grow and shrink; fixed C arrays never do.
  const growable = obj.kind !== 'array';
  const pushedAt = events.find((e) => e.type === 'item_insert' && e.id === obj.id);
  const pushedIndex = pushedAt && pushedAt.type === 'item_insert' ? pushedAt.index : -1;

  const cursors = indexCursors(frames, items.length, obj.id, subscriptNames(trace?.source));
  // Exactly one current cell: the cursor that just moved, else the first cursor.
  const moved = cursors.find((c) => events.some((e) => (e.type === 'var_update' || e.type === 'var_create') && e.name === c.name));
  const current = (moved ?? cursors[0])?.index;
  const visited = cursors.length > 0 ? visitedIndices(trace, at, items.length, obj.id) : new Set<number>();

  return (
    <div className={styles.card}>
      <StructureHeader
        name={label || obj.id}
        meta={`${obj.typeName}, length ${items.length}`}
        address={obj.address}
        caption={caption(events, obj.id)}
      >
        {actions}
      </StructureHeader>
      {items.length === 0 && !growable ? (
        <div className={styles.empty}>Empty</div>
      ) : (
        <motion.div layout className={styles.row} transition={motionTokens.layoutSpring}>
          {items.length === 0 && <div className={styles.empty}>Empty</div>}
          <AnimatePresence initial={false}>
          {items.map((item, idx) => {
            const here = cursors.filter((c) => c.index === idx);
            const pushed = growable && idx === pushedIndex;
            const content = (
              <>
                <div className={styles.markers}>
                  {here.map((c) => (
                    // Shared layoutId makes the marker glide from its old cell to this one.
                    <motion.span
                      key={c.name}
                      layoutId={`${obj.id}:${c.name}`}
                      transition={motionTokens.layoutSpring}
                      className={cx(styles.marker, idx === current && styles.markerCurrent)}
                    >
                      {c.name}
                      <span aria-hidden>▼</span>
                    </motion.span>
                  ))}
                </div>
                <div
                  className={cx(
                    styles.cell,
                    visited.has(idx) && styles.visited,
                    pushed ? cx(styles.added, styles.pushPulse) : changed.has(idx) ? styles.changed : idx === current && styles.current
                  )}
                >
                  <ValueCell value={item} onHoverRef={onHoverRef} />
                </div>
                <span className={cx(styles.index, idx === current && styles.indexCurrent)}>{idx}</span>
              </>
            );
            return growable ? (
              <Slot key={idx} pushed={pushed}>
                {content}
              </Slot>
            ) : (
              <div key={idx} className={styles.slot}>
                {content}
              </div>
            );
          })}
          </AnimatePresence>
        </motion.div>
      )}
    </div>
  );
};

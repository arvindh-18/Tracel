import React from 'react';
import { Frame, HeapObject, TraceEvent } from '../../../trace/schema';
import { cx } from '../../../ui/cx';
import { ValueCell } from '../values/ValueCell';
import { StructureHeader } from './StructureHeader';
import { caption, indexCursors } from './grammar';
import styles from './Structure.module.css';
import own from './GridView.module.css';

export interface GridViewProps {
  obj: HeapObject;
  allHeap: Record<string, HeapObject>;
  label?: string;
  frames: Frame[];
  events: TraceEvent[];
  onHoverRef?: (heapId: string | null) => void;
}

const ROW_NAMES = /^(i|r|row|y)$/;
const COL_NAMES = /^(j|c|col|x)$/;

/** A 2-D array or list of lists as a table; index variables highlight the current row and cell. */
export const GridView: React.FC<GridViewProps> = ({ obj, allHeap, label, frames, events, onHoverRef }) => {
  const rows = (obj.items ?? []).map((it) => ('id' in it && it.id ? allHeap[it.id] : undefined));
  const width = rows[0]?.items?.length ?? 0;

  const rowCursor = indexCursors(frames, rows.length).find((c) => ROW_NAMES.test(c.name));
  const colCursor = indexCursors(frames, width).find((c) => COL_NAMES.test(c.name));

  const changed = new Set<string>();
  rows.forEach((row, r) => {
    for (const ev of events) {
      if (row && ev.type === 'item_set' && ev.id === row.id) changed.add(`${r}:${ev.index}`);
    }
  });

  return (
    <div className={styles.card}>
      <StructureHeader
        name={label || obj.id}
        meta={`${obj.typeName}, ${rows.length} × ${width}`}
        address={obj.address}
        caption={caption(events, obj.id) ?? rows.map((row) => row && caption(events, row.id)).find(Boolean) ?? null}
      />
      <div className={own.scroll}>
        <table className={own.grid}>
          <thead>
            <tr>
              <th aria-hidden />
              {Array.from({ length: width }, (_, c) => (
                <th key={c} className={cx(styles.index, c === colCursor?.index && styles.indexCurrent)} scope="col">
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, r) => (
              <tr key={row?.id ?? r}>
                <th className={cx(styles.index, r === rowCursor?.index && styles.indexCurrent)} scope="row">
                  {r}
                </th>
                {(row?.items ?? []).map((item, c) => {
                  const isCurrent = r === rowCursor?.index && (colCursor ? c === colCursor.index : true);
                  return (
                    <td key={c}>
                      <div className={cx(styles.cell, changed.has(`${r}:${c}`) ? styles.changed : isCurrent && styles.current)}>
                        <ValueCell value={item} onHoverRef={onHoverRef} />
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

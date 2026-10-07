import React, { useState } from 'react';
import { Frame, TraceEvent } from '../../../trace/schema';
import { ValueCell } from '../values/ValueCell';
import { DisclosureButton } from '../../../ui/Disclosure';
import { Badge } from '../../../ui/Badge';
import { cx } from '../../../ui/cx';
import { Section } from '../Section';
import styles from './Frames.module.css';

export interface FramesSectionProps {
  frames: Frame[];
  events: TraceEvent[];
  onHoverRef?: (heapId: string | null) => void;
}

export const FramesSection: React.FC<FramesSectionProps> = ({ frames, events, onHoverRef }) => {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  if (frames.length === 0) return null;

  const updatedVars = new Set<string>();
  const createdVars = new Set<string>();
  for (const ev of events) {
    if (ev.type === 'var_update') updatedVars.add(ev.name);
    if (ev.type === 'var_create') createdVars.add(ev.name);
  }

  return (
    <Section title={frames.length > 1 ? 'Call stack' : 'Variables'} count={frames.length > 1 ? frames.length : undefined}>
      <div className={styles.list}>
        {frames.map((frame, idx) => {
          const isTop = idx === 0;
          // Only the active frame is open by default; callers are collapsed.
          const isOpen = isTop || (expanded[frame.id] ?? false);
          const name = (
            <>
              <span className={styles.name}>{frame.name}</span>
              <span className={styles.meta}>line {frame.line}</span>
            </>
          );

          return (
            <div key={frame.id} className={cx(styles.frame, isTop && styles.top)}>
              <div className={styles.header}>
                {isTop ? (
                  <div className={styles.title}>{name}</div>
                ) : (
                  <DisclosureButton
                    open={isOpen}
                    className={styles.title}
                    onClick={() => setExpanded((p) => ({ ...p, [frame.id]: !isOpen }))}
                  >
                    {name}
                  </DisclosureButton>
                )}
                {frame.returnValue && (
                  <Badge variant="call">
                    returns <ValueCell value={frame.returnValue} />
                  </Badge>
                )}
              </div>

              {isOpen &&
                (frame.locals.length === 0 ? (
                  <div className={styles.empty}>No local variables</div>
                ) : (
                  <div className={styles.locals}>
                    {frame.locals.map(([varName, val]) => (
                      <React.Fragment key={varName}>
                        <span className={styles.varName}>{varName}</span>
                        <span
                          className={cx(
                            styles.value,
                            isTop && updatedVars.has(varName) && styles.updated,
                            isTop && createdVars.has(varName) && styles.created
                          )}
                        >
                          <ValueCell value={val} onHoverRef={onHoverRef} />
                        </span>
                      </React.Fragment>
                    ))}
                  </div>
                ))}
            </div>
          );
        })}
      </div>
    </Section>
  );
};

import React, { useState } from 'react';
import { Frame, TraceEvent } from '../../../trace/schema';
import { ValueCell } from '../values/ValueCell';
import { ChevronDown, ChevronRight } from 'lucide-react';

export interface FramesSectionProps {
  frames: Frame[];
  events: TraceEvent[];
  onHoverRef?: (heapId: string | null) => void;
}

export const FramesSection: React.FC<FramesSectionProps> = ({
  frames,
  events,
  onHoverRef,
}) => {
  const [collapsedFrames, setCollapsedFrames] = useState<Record<string, boolean>>({});

  if (frames.length === 0) return null;

  const toggleCollapse = (id: string) => {
    setCollapsedFrames((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  // Find updated or created variable names in events for current step
  const updatedVars = new Set<string>();
  const createdVars = new Set<string>();

  for (const ev of events) {
    if (ev.type === 'var_update') updatedVars.add(ev.name);
    if (ev.type === 'var_create') createdVars.add(ev.name);
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      <div
        style={{
          fontSize: '11px',
          fontWeight: 600,
          color: 'var(--text-3)',
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
        }}
      >
        {frames.length > 1 ? 'Call Stack & Frames' : 'Variables'}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        {frames.map((frame, idx) => {
          const isTop = idx === 0;
          const isCollapsed = !isTop && (collapsedFrames[frame.id] ?? true);

          return (
            <div
              key={frame.id}
              style={{
                backgroundColor: 'var(--bg-2)',
                border: '1px solid var(--line-1)',
                borderLeft: isTop
                  ? '3px solid var(--sem-call)'
                  : '3px solid var(--line-2)',
                borderRadius: 'var(--r-6)',
                overflow: 'hidden',
                transition: 'border-color 150ms ease',
              }}
            >
              {/* Frame Header */}
              <div
                onClick={() => !isTop && toggleCollapse(frame.id)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '6px 10px',
                  backgroundColor: 'var(--bg-3)',
                  cursor: isTop ? 'default' : 'pointer',
                  userSelect: 'none',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  {!isTop && (
                    <span style={{ color: 'var(--text-3)', display: 'inline-flex' }}>
                      {isCollapsed ? <ChevronRight size={13} /> : <ChevronDown size={13} />}
                    </span>
                  )}
                  <span
                    style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: '12.5px',
                      fontWeight: 600,
                      color: isTop ? 'var(--text-1)' : 'var(--text-2)',
                    }}
                  >
                    {frame.name}
                  </span>
                  <span style={{ fontSize: '11px', color: 'var(--text-3)' }}>
                    line {frame.line}
                  </span>
                </div>

                {frame.returnValue && (
                  <span
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '4px',
                      padding: '1px 6px',
                      backgroundColor: 'var(--sem-call-soft)',
                      border: '1px solid var(--sem-call-line)',
                      borderRadius: 'var(--r-4)',
                      fontSize: '11px',
                      color: 'var(--sem-call)',
                    }}
                  >
                    returns <ValueCell value={frame.returnValue} />
                  </span>
                )}
              </div>

              {/* Locals Table */}
              {!isCollapsed && (
                <div style={{ padding: '6px 10px' }}>
                  {frame.locals.length === 0 ? (
                    <div
                      style={{
                        fontSize: '11.5px',
                        color: 'var(--text-4)',
                        fontStyle: 'italic',
                      }}
                    >
                      (no local variables)
                    </div>
                  ) : (
                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: 'minmax(80px, auto) 1fr',
                        rowGap: '6px',
                        columnGap: '12px',
                        alignItems: 'center',
                      }}
                    >
                      {frame.locals.map(([name, val]) => {
                        const isUpdated = isTop && updatedVars.has(name);
                        const isCreated = isTop && createdVars.has(name);

                        return (
                          <React.Fragment key={name}>
                            <span
                              style={{
                                fontFamily: 'var(--font-mono)',
                                fontSize: '12px',
                                color: 'var(--text-2)',
                              }}
                            >
                              {name}
                            </span>
                            <span
                              style={{
                                fontFamily: 'var(--font-mono)',
                                fontSize: '12px',
                                padding: '1px 4px',
                                borderRadius: 'var(--r-4)',
                                backgroundColor: isUpdated
                                  ? 'var(--exec-soft)'
                                  : isCreated
                                  ? 'var(--sem-create-soft)'
                                  : 'transparent',
                                transition: 'background-color 900ms ease',
                                width: 'fit-content',
                              }}
                            >
                              <ValueCell value={val} onHoverRef={onHoverRef} />
                            </span>
                          </React.Fragment>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};


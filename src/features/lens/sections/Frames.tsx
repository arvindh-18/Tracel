import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
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

      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <AnimatePresence mode="popLayout" initial={false}>
          {frames.map((frame, idx) => {
            const isTop = idx === 0;
            const isCollapsed = !isTop && (collapsedFrames[frame.id] ?? true);

            return (
              <motion.div
                key={frame.id}
                layout
                initial={{ opacity: 0, y: -15, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -15, scale: 0.98 }}
                transition={{
                  type: 'spring',
                  stiffness: 420,
                  damping: 32,
                  mass: 0.8,
                }}
                style={{
                  backgroundColor: 'var(--bg-2)',
                  border: '1px solid var(--line-1)',
                  borderLeft: isTop
                    ? '3px solid var(--sem-call)'
                    : '3px solid var(--line-2)',
                  borderRadius: 'var(--r-8)',
                  overflow: 'hidden',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
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
                    padding: '8px 12px',
                    backgroundColor: 'var(--bg-3)',
                    cursor: isTop ? 'default' : 'pointer',
                    userSelect: 'none',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
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
                    <span
                      style={{
                        fontSize: '11px',
                        color: 'var(--text-3)',
                        backgroundColor: 'var(--bg-4)',
                        padding: '1px 5px',
                        borderRadius: 'var(--r-4)',
                      }}
                    >
                      line {frame.line}
                    </span>
                  </div>

                  {frame.returnValue && (
                    <span
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '4px',
                        padding: '2px 8px',
                        backgroundColor: 'var(--sem-call-soft)',
                        border: '1px solid var(--sem-call-line)',
                        borderRadius: 'var(--r-4)',
                        fontSize: '11.5px',
                        color: 'var(--sem-call)',
                        fontWeight: 500,
                      }}
                    >
                      returns <ValueCell value={frame.returnValue} />
                    </span>
                  )}
                </div>

                {/* Locals Table / Blocks */}
                {!isCollapsed && (
                  <div style={{ padding: '8px 12px' }}>
                    {frame.locals.length === 0 ? (
                      <div
                        style={{
                          fontSize: '11.5px',
                          color: 'var(--text-4)',
                          fontStyle: 'italic',
                          padding: '4px 0',
                        }}
                      >
                        (no local variables)
                      </div>
                    ) : (
                      <div
                        style={{
                          display: 'flex',
                          flexDirection: 'column',
                          gap: '6px',
                        }}
                      >
                        <AnimatePresence mode="popLayout" initial={false}>
                          {frame.locals.map(([name, val]) => {
                            const isUpdated = isTop && updatedVars.has(name);
                            const isCreated = isTop && createdVars.has(name);

                            return (
                              <motion.div
                                key={`${frame.id}-${name}`}
                                layout
                                initial={{ opacity: 0, x: -12 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, x: 12 }}
                                transition={{
                                  type: 'spring',
                                  stiffness: 420,
                                  damping: 30,
                                }}
                                style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'space-between',
                                  padding: '5px 8px',
                                  backgroundColor: isUpdated
                                    ? 'var(--exec-soft)'
                                    : isCreated
                                    ? 'var(--sem-create-soft)'
                                    : 'var(--bg-3)',
                                  border: `1px solid ${
                                    isUpdated
                                      ? 'var(--exec)'
                                      : isCreated
                                      ? 'var(--sem-create)'
                                      : 'var(--line-1)'
                                  }`,
                                  borderRadius: 'var(--r-6)',
                                  transition:
                                    'background-color 500ms ease, border-color 500ms ease',
                                }}
                              >
                                <span
                                  style={{
                                    fontFamily: 'var(--font-mono)',
                                    fontSize: '12px',
                                    color: 'var(--text-2)',
                                    fontWeight: 500,
                                  }}
                                >
                                  {name}
                                </span>
                                <span
                                  style={{
                                    fontFamily: 'var(--font-mono)',
                                    fontSize: '12px',
                                    color: 'var(--text-1)',
                                  }}
                                >
                                  <ValueCell value={val} onHoverRef={onHoverRef} />
                                </span>
                              </motion.div>
                            );
                          })}
                        </AnimatePresence>
                      </div>
                    )}
                  </div>
                )}
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </div>
  );
};

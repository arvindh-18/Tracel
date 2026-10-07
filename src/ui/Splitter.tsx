import React, { useState, useRef, useCallback } from 'react';
import { cx } from './cx';
import styles from './Splitter.module.css';

export interface SplitterProps {
  left: React.ReactNode;
  right: React.ReactNode;
  defaultSplit?: number; // percentage (e.g. 52)
  minLeftPx?: number;
  minRightPx?: number;
  direction?: 'horizontal' | 'vertical';
  storageKey?: string;
}

function save(key: string, value: number) {
  try {
    localStorage.setItem(key, String(value));
  } catch {
    // Position just won't persist.
  }
}

export const Splitter: React.FC<SplitterProps> = ({
  left,
  right,
  defaultSplit = 52,
  minLeftPx = 360,
  minRightPx = 360,
  direction = 'horizontal',
  storageKey = 'tracel:splitter-pos',
}) => {
  const [split, setSplit] = useState<number>(() => {
    try {
      const saved = Number(localStorage.getItem(storageKey));
      if (saved > 0 && saved < 100) return saved;
    } catch {
      // Fall through to the default.
    }
    return defaultSplit;
  });
  const [dragging, setDragging] = useState(false);
  const splitRef = useRef(split);
  splitRef.current = split;

  const containerRef = useRef<HTMLDivElement>(null);
  const isHoriz = direction === 'horizontal';

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      setDragging(true);

      const onMouseMove = (ev: MouseEvent) => {
        const rect = containerRef.current?.getBoundingClientRect();
        if (!rect) return;
        const total = isHoriz ? rect.width : rect.height;
        const pos = isHoriz ? ev.clientX - rect.left : ev.clientY - rect.top;
        const clamped = Math.max(minLeftPx, Math.min(total - minRightPx, pos));
        setSplit((clamped / total) * 100);
      };

      const onMouseUp = () => {
        setDragging(false);
        window.removeEventListener('mousemove', onMouseMove);
        window.removeEventListener('mouseup', onMouseUp);
        save(storageKey, splitRef.current);
      };

      window.addEventListener('mousemove', onMouseMove);
      window.addEventListener('mouseup', onMouseUp);
    },
    [isHoriz, minLeftPx, minRightPx, storageKey]
  );

  return (
    <div
      ref={containerRef}
      className={cx(styles.container, !isHoriz && styles.vertical, dragging && styles.dragging)}
      style={{ '--split': `${split}%` } as React.CSSProperties}
    >
      <div className={cx(styles.pane, styles.first)}>{left}</div>
      <div
        role="separator"
        aria-orientation={isHoriz ? 'vertical' : 'horizontal'}
        aria-valuenow={Math.round(split)}
        tabIndex={0}
        className={styles.handle}
        onMouseDown={handleMouseDown}
        onDoubleClick={() => {
          setSplit(defaultSplit);
          save(storageKey, defaultSplit);
        }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') setSplit((s) => Math.max(20, s - 2));
          else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') setSplit((s) => Math.min(80, s + 2));
        }}
      />
      <div className={cx(styles.pane, styles.second)}>{right}</div>
    </div>
  );
};

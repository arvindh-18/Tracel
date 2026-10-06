import React, { useState, useEffect, useRef, useCallback } from 'react';

export interface SplitterProps {
  left: React.ReactNode;
  right: React.ReactNode;
  defaultSplit?: number; // percentage (e.g. 52)
  minLeftPx?: number;
  minRightPx?: number;
  direction?: 'horizontal' | 'vertical';
  storageKey?: string;
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
      const saved = localStorage.getItem(storageKey);
      if (saved) return Number(saved);
    } catch {
      // ignore
    }
    return defaultSplit;
  });

  const containerRef = useRef<HTMLDivElement>(null);
  const isDraggingRef = useRef(false);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isDraggingRef.current = true;
    document.body.style.cursor = direction === 'horizontal' ? 'col-resize' : 'row-resize';
    document.body.style.userSelect = 'none';

    const onMouseMove = (moveEvent: MouseEvent) => {
      if (!isDraggingRef.current || !containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();

      if (direction === 'horizontal') {
        const totalWidth = rect.width;
        const currentX = moveEvent.clientX - rect.left;
        const clampedX = Math.max(minLeftPx, Math.min(totalWidth - minRightPx, currentX));
        const newPct = (clampedX / totalWidth) * 100;
        setSplit(newPct);
      } else {
        const totalHeight = rect.height;
        const currentY = moveEvent.clientY - rect.top;
        const clampedY = Math.max(minLeftPx, Math.min(totalHeight - minRightPx, currentY));
        const newPct = (clampedY / totalHeight) * 100;
        setSplit(newPct);
      }
    };

    const onMouseUp = () => {
      isDraggingRef.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      try {
        localStorage.setItem(storageKey, String(split));
      } catch {
        // ignore
      }
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  }, [direction, minLeftPx, minRightPx, split, storageKey]);

  const handleDoubleClick = () => {
    setSplit(defaultSplit);
    try {
      localStorage.setItem(storageKey, String(defaultSplit));
    } catch {
      // ignore
    }
  };

  const isHoriz = direction === 'horizontal';

  return (
    <div
      ref={containerRef}
      style={{
        display: 'flex',
        flexDirection: isHoriz ? 'row' : 'column',
        width: '100%',
        height: '100%',
        overflow: 'hidden',
        position: 'relative',
      }}
    >
      <div
        style={{
          width: isHoriz ? `${split}%` : '100%',
          height: isHoriz ? '100%' : `${split}%`,
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {left}
      </div>

      <div
        role="separator"
        aria-orientation={isHoriz ? 'vertical' : 'horizontal'}
        tabIndex={0}
        onMouseDown={handleMouseDown}
        onDoubleClick={handleDoubleClick}
        onKeyDown={(e) => {
          if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
            setSplit((s) => Math.max(20, s - 2));
          } else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
            setSplit((s) => Math.min(80, s + 2));
          }
        }}
        style={{
          width: isHoriz ? '6px' : '100%',
          height: isHoriz ? '100%' : '6px',
          margin: isHoriz ? '0 -3px' : '-3px 0',
          cursor: isHoriz ? 'col-resize' : 'row-resize',
          zIndex: 10,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          position: 'relative',
        }}
      >
        <div
          style={{
            width: isHoriz ? '1px' : '100%',
            height: isHoriz ? '100%' : '1px',
            backgroundColor: 'var(--line-1)',
            transition: 'background-color 140ms ease',
          }}
        />
      </div>

      <div
        style={{
          width: isHoriz ? `${100 - split}%` : '100%',
          height: isHoriz ? '100%' : `${100 - split}%`,
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {right}
      </div>
    </div>
  );
};


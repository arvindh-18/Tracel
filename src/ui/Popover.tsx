import React, { useEffect, useRef } from 'react';
import { cx } from './cx';
import styles from './Popover.module.css';

export interface PopoverProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  trigger: React.ReactNode;
  align?: 'start' | 'end';
  role?: 'menu' | 'dialog';
  label?: string;
  className?: string;
  children: React.ReactNode;
}

/** A floating panel anchored under its trigger. Closes on outside click and Escape. */
export const Popover: React.FC<PopoverProps> = ({
  open,
  onOpenChange,
  trigger,
  align = 'start',
  role = 'dialog',
  label,
  className,
  children,
}) => {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) onOpenChange(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onOpenChange(false);
    };
    window.addEventListener('pointerdown', onPointer);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('pointerdown', onPointer);
      window.removeEventListener('keydown', onKey);
    };
  }, [open, onOpenChange]);

  return (
    <div ref={rootRef} className={styles.root}>
      {trigger}
      {open && (
        <div role={role} aria-label={label} className={cx(styles.panel, styles[align], className)}>
          {children}
        </div>
      )}
    </div>
  );
};

export const MenuGroup: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div role="group" aria-label={label} className={styles.group}>
    <div className={styles.groupLabel}>{label}</div>
    {children}
  </div>
);

export const MenuItem: React.FC<{ selected?: boolean; onSelect: () => void; children: React.ReactNode }> = ({
  selected,
  onSelect,
  children,
}) => (
  <button type="button" role="menuitem" className={cx(styles.item, selected && styles.itemSelected)} onClick={onSelect}>
    {children}
  </button>
);

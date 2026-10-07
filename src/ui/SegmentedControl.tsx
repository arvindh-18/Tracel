import React from 'react';
import { cx } from './cx';
import styles from './SegmentedControl.module.css';

export interface SegmentOption<T extends string | number> {
  value: T;
  label: React.ReactNode;
  title?: string;
}

export interface SegmentedControlProps<T extends string | number> {
  options: SegmentOption<T>[];
  value: T;
  onChange: (value: T) => void;
  size?: 'sm' | 'md';
  /** Stretch to the container width instead of sizing to content. */
  fill?: boolean;
  'aria-label'?: string;
  className?: string;
}

export function SegmentedControl<T extends string | number>({
  options,
  value,
  onChange,
  size = 'md',
  fill = false,
  className,
  ...aria
}: SegmentedControlProps<T>) {
  return (
    <div role="radiogroup" className={cx(styles.group, styles[size], fill && styles.fill, className)} {...aria}>
      {options.map((opt) => {
        const selected = opt.value === value;
        return (
          <button
            key={String(opt.value)}
            type="button"
            role="radio"
            aria-checked={selected}
            title={opt.title}
            onClick={() => onChange(opt.value)}
            className={cx(styles.option, selected && styles.selected)}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

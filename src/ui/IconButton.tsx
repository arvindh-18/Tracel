import React from 'react';
import { cx } from './cx';
import styles from './IconButton.module.css';

export interface IconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  icon: React.ReactNode;
  /** Accessible name; also shown as the native tooltip. */
  label: string;
  size?: 'sm' | 'md';
  active?: boolean;
}

export const IconButton: React.FC<IconButtonProps> = ({
  icon,
  label,
  size = 'md',
  active = false,
  className,
  type = 'button',
  ...props
}) => (
  <button
    type={type}
    title={label}
    aria-label={label}
    className={cx(styles.button, styles[size], active && styles.active, className)}
    {...props}
  >
    {icon}
  </button>
);

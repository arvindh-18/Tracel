import React from 'react';
import { cx } from './cx';
import styles from './Badge.module.css';

export interface BadgeProps {
  children: React.ReactNode;
  variant?: 'default' | 'exec' | 'create' | 'update' | 'remove' | 'ref' | 'call' | 'info';
  mono?: boolean;
  className?: string;
  title?: string;
}

export const Badge: React.FC<BadgeProps> = ({ children, variant = 'default', mono = false, className, title }) => (
  <span title={title} className={cx(styles.badge, variant !== 'default' && styles[variant], mono && styles.mono, className)}>
    {children}
  </span>
);

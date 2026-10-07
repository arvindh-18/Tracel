import React from 'react';
import { ChevronRight } from 'lucide-react';
import { cx } from './cx';
import styles from './Disclosure.module.css';

export interface DisclosureButtonProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'type'> {
  open: boolean;
  /** Fill the row width (for panel headers). */
  block?: boolean;
}

/** A button that shows/hides related content, with a chevron that rotates when open. */
export const DisclosureButton: React.FC<DisclosureButtonProps> = ({ open, block, className, children, ...props }) => (
  <button
    type="button"
    aria-expanded={open}
    className={cx(styles.toggle, block && styles.block, open && styles.open, className)}
    {...props}
  >
    <ChevronRight size={14} className={styles.chevron} aria-hidden />
    {children}
  </button>
);

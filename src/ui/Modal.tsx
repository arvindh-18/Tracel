import React, { useEffect, useId } from 'react';
import { X } from 'lucide-react';
import { IconButton } from './IconButton';
import { cx } from './cx';
import styles from './Modal.module.css';

export interface ModalProps {
  title: string;
  isOpen: boolean;
  onClose: () => void;
  size?: 'sm' | 'md';
  children: React.ReactNode;
}

export const Modal: React.FC<ModalProps> = ({ title, isOpen, onClose, size = 'sm', children }) => {
  const titleId = useId();

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className={styles.scrim} onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={cx(styles.dialog, styles[size])}
        onClick={(e) => e.stopPropagation()}
      >
        <div className={styles.header}>
          <h2 id={titleId} className={styles.title}>
            {title}
          </h2>
          <IconButton size="sm" icon={<X size={16} />} label="Close" onClick={onClose} />
        </div>
        <div className={styles.body}>{children}</div>
      </div>
    </div>
  );
};

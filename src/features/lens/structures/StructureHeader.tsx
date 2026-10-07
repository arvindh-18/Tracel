import React from 'react';
import { usePrefsStore } from '../../../store/prefs';
import styles from './Structure.module.css';

export const StructureHeader: React.FC<{
  name: string;
  meta: string;
  address?: string;
  caption?: string | null;
  children?: React.ReactNode;
}> = ({ name, meta, address, caption, children }) => {
  const showAddresses = usePrefsStore((s) => s.showAddresses);
  return (
    <div className={styles.header}>
      <span className={styles.name}>{name}</span>
      <span className={styles.meta}>{meta}</span>
      {address && showAddresses && <span className={styles.address}>@{address}</span>}
      {children}
      {caption && (
        <span className={styles.caption} aria-live="polite">
          {caption}
        </span>
      )}
    </div>
  );
};

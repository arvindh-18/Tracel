import React from 'react';
import { Badge } from '../../ui/Badge';
import styles from './Section.module.css';

export interface SectionProps {
  title: string;
  count?: number;
  aside?: React.ReactNode;
  children: React.ReactNode;
}

export const Section: React.FC<SectionProps> = ({ title, count, aside, children }) => (
  <section className={styles.section} aria-label={title}>
    <header className={styles.header}>
      <h2 className={styles.title}>{title}</h2>
      {count !== undefined && <Badge>{count}</Badge>}
      {aside && <span className={styles.aside}>{aside}</span>}
    </header>
    {children}
  </section>
);

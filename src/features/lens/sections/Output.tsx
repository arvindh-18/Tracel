import React from 'react';
import { Section } from '../Section';
import styles from './Output.module.css';

export const OutputSection: React.FC<{ output: string }> = ({ output }) => {
  if (!output) return null;
  return (
    <Section title="Output">
      <pre className={styles.output}>{output}</pre>
    </Section>
  );
};

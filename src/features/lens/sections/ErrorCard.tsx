import React, { useState } from 'react';
import { AlertCircle } from 'lucide-react';
import { TraceError } from '../../../trace/schema';
import { DisclosureButton } from '../../../ui/Disclosure';
import styles from './ErrorCard.module.css';

export const ErrorCard: React.FC<{ error: TraceError }> = ({ error }) => {
  const [showRaw, setShowRaw] = useState(false);

  return (
    <div role="alert" className={styles.card}>
      <div className={styles.header}>
        <AlertCircle size={16} className={styles.icon} aria-hidden />
        <h2 className={styles.title}>{error.title || error.kind}</h2>
        <span className={styles.line}>Line {error.line}</span>
      </div>
      <p className={styles.explanation}>{error.explanation}</p>
      {error.stateNote && <p className={styles.note}>{error.stateNote}</p>}
      <div>
        <DisclosureButton open={showRaw} onClick={() => setShowRaw(!showRaw)}>
          Runtime message
        </DisclosureButton>
        {showRaw && (
          <pre className={styles.raw}>
            {error.kind}: {error.message}
          </pre>
        )}
      </div>
    </div>
  );
};

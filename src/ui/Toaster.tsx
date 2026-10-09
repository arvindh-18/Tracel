import React from 'react';
import { X } from 'lucide-react';
import { useToastStore } from '../store/toasts';
import { cx } from './cx';
import styles from './Toaster.module.css';

export const Toaster: React.FC = () => {
  const toasts = useToastStore((s) => s.toasts);
  const dismiss = useToastStore((s) => s.dismiss);
  return (
    <div className={styles.region} role="status" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={cx(styles.toast, t.tone === 'error' && styles.error)}>
          <span>{t.message}</span>
          <button type="button" className={styles.close} aria-label="Dismiss" onClick={() => dismiss(t.id)}>
            <X size={14} aria-hidden />
          </button>
        </div>
      ))}
    </div>
  );
};

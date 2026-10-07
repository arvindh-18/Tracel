import React from 'react';
import { useSessionStore, SupportedLanguage } from '../../../store/session';
import { KeyCombo, modKey } from '../../../ui/Kbd';
import styles from './EmptyState.module.css';

// Variable names the program assigns at the top level (Python) or declares
// in a function body (C/C++). Only names are shown: values aren't known
// until the program runs, so the preview never claims one.
function previewNames(code: string, language: SupportedLanguage): string[] {
  const pattern =
    language === 'python'
      ? /^([A-Za-z_]\w*)\s*=(?!=)/gm
      : /^\s+(?:const\s+)?(?:unsigned\s+)?(?:int|long|short|float|double|char|bool|auto|string|std::string|[A-Z]\w*)\s*\*?\s+\**([A-Za-z_]\w*)\s*(?:=|\[|;|\{)/gm;
  const names: string[] = [];
  for (const m of code.matchAll(pattern)) {
    const name = m[1]!;
    if (!names.includes(name)) names.push(name);
    if (names.length === 6) break;
  }
  return names;
}

export const EmptyState: React.FC = () => {
  const language = useSessionStore((s) => s.language);
  const code = useSessionStore((s) => s.codeByLanguage[s.language]);
  const names = previewNames(code, language);
  const frameName = language === 'python' ? '<module>' : 'main';

  return (
    <div className={styles.root}>
      <div className={styles.intro}>
        <h2 className={styles.title}>Nothing traced yet</h2>
        <p className={styles.body}>Run the program to see each step here.</p>
        <p className={styles.shortcut}>
          <KeyCombo keys={[modKey, '↵']} /> runs it from anywhere.
        </p>
      </div>

      <div className={styles.preview} aria-hidden>
        <div className={styles.previewHeading}>Variables</div>
        <div className={styles.frame}>
          <div className={styles.frameHeader}>{frameName}</div>
          {names.length > 0 ? (
            <div className={styles.rows}>
              {names.map((n) => (
                <React.Fragment key={n}>
                  <span>{n}</span>
                  <span className={styles.slot} />
                </React.Fragment>
              ))}
            </div>
          ) : (
            <div className={styles.none}>Variables appear here as they are assigned.</div>
          )}
        </div>
      </div>
    </div>
  );
};

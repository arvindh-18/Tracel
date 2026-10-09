import React, { useEffect, useState } from 'react';
import { AlertCircle, Sparkles } from 'lucide-react';
import { TraceError } from '../../../trace/schema';
import { DisclosureButton } from '../../../ui/Disclosure';
import { Button } from '../../../ui/Button';
import { useSessionStore } from '../../../store/session';
import { usePrefsStore } from '../../../store/prefs';
import { toast } from '../../../store/toasts';
import { AiError, NO_KEY_MESSAGE, explainError } from '../../../engine/adapters/ai/client';
import { ErrorHelp } from '../../../engine/adapters/ai/schema';
import { formatValue } from '../structures/grammar';
import { useHasApiKey } from '../../ai/useApiKey';
import { simulateCurrentWithAi } from '../../ai/actions';
import styles from './ErrorCard.module.css';

export const ErrorCard: React.FC<{ error: TraceError }> = ({ error }) => {
  const [showRaw, setShowRaw] = useState(false);
  const [help, setHelp] = useState<ErrorHelp | null>(null);
  const [asking, setAsking] = useState(false);
  const hasKey = useHasApiKey();
  const language = useSessionStore((s) => s.language);
  const isRunning = useSessionStore((s) => s.isRunning);
  const aiSimulated = useSessionStore((s) => s.trace?.engine === 'ai');

  useEffect(() => setHelp(null), [error]);

  const unsupportedCpp = error.phase === 'unsupported' && language !== 'python';

  const askAi = async () => {
    const { codeByLanguage, stdin } = useSessionStore.getState();
    setAsking(true);
    try {
      setHelp(
        await explainError({
          language,
          source: codeByLanguage[language],
          stdin,
          error: { kind: error.kind, title: error.title, message: error.message, line: error.line },
          context: error.context.map((c) => `${c.name} = ${formatValue(c.value)}`),
          model: usePrefsStore.getState().aiModel,
        })
      );
    } catch (err) {
      toast(err instanceof AiError ? err.message : 'Could not get an explanation.', 'error');
    } finally {
      setAsking(false);
    }
  };

  return (
    <div role="alert" className={styles.card}>
      <div className={styles.header}>
        <AlertCircle size={16} className={styles.icon} aria-hidden />
        <h2 className={styles.title}>{error.title || error.kind}</h2>
        <span className={styles.line}>Line {error.line}</span>
      </div>
      <p className={styles.explanation}>{error.explanation}</p>
      {error.context.length > 0 && (
        <p className={styles.note}>
          {error.context.map((c) => `${c.name} = ${formatValue(c.value)}`).join(', ')}
        </p>
      )}
      {error.stateNote && <p className={styles.note}>{error.stateNote}</p>}

      {help && (
        <div className={styles.help}>
          <h3 className={styles.helpTitle}>
            <Sparkles size={14} aria-hidden /> AI explanation
          </h3>
          <p>{help.explanation}</p>
          <h3 className={styles.helpTitle}>Suggested fix</h3>
          <p className={styles.fix}>{help.fix}</p>
        </div>
      )}

      <div className={styles.actions}>
        {!help && !aiSimulated && error.phase !== 'parse' && error.phase !== 'unsupported' && (
          <Button size="sm" variant="ghost" icon={<Sparkles size={14} />} disabled={!hasKey} loading={asking} onClick={askAi}>
            Explain this error
          </Button>
        )}
        {unsupportedCpp && (
          <Button size="sm" variant="ghost" icon={<Sparkles size={14} />} disabled={!hasKey || isRunning} onClick={simulateCurrentWithAi}>
            Simulate with AI (may be inaccurate)
          </Button>
        )}
        {!hasKey && (error.phase === 'runtime' || unsupportedCpp) && <span className={styles.hint}>{NO_KEY_MESSAGE}</span>}
      </div>

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

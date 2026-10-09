import { engineHost } from '../../engine/host';
import { AiError } from '../../engine/adapters/ai/client';
import { RunCancelled } from '../../engine/adapters/types';
import { usePlaybackStore } from '../../store/playback';
import { usePrefsStore } from '../../store/prefs';
import { useSessionStore } from '../../store/session';
import { toast } from '../../store/toasts';

/** "Simulate with AI": Gemini traces a C/C++ program the interpreter rejected. */
export async function simulateCurrentWithAi() {
  const session = useSessionStore.getState();
  const lang = session.language;
  if (lang === 'python' || session.isRunning) return;
  const { aiStepLimit, aiModel } = usePrefsStore.getState();
  session.setIsRunning(true);
  session.setRuntimeLoading(true, 'Simulating with AI…');
  try {
    const trace = await engineHost.simulateWithAi(lang, session.codeByLanguage[lang], session.stdin, { stepLimit: aiStepLimit, aiModel });
    useSessionStore.getState().setTrace(trace);
    usePlaybackStore.getState().restart();
    usePlaybackStore.getState().play();
  } catch (err) {
    if (!(err instanceof RunCancelled)) toast(err instanceof AiError ? err.message : 'AI simulation failed.', 'error');
  } finally {
    useSessionStore.getState().setRuntimeLoading(false);
    useSessionStore.getState().setIsRunning(false);
  }
}

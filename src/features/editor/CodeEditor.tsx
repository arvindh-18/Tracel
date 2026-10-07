import React, { useEffect, useRef, useState } from 'react';
import { EditorState } from '@codemirror/state';
import { EditorView, lineNumbers, keymap } from '@codemirror/view';
import { defaultKeymap, indentWithTab } from '@codemirror/commands';
import { python } from '@codemirror/lang-python';
import { cpp } from '@codemirror/lang-cpp';
import { useSessionStore } from '../../store/session';
import { usePlaybackStore } from '../../store/playback';
import { tracelTheme, tracelSyntaxHighlight } from './theme';
import {
  execLineField,
  createExecGutter,
  setExecLineEffect,
  setBreakpointsEffect,
} from './extensions/execLine';
import { stateAt } from '../../trace/reconstruct';
import { Button } from '../../ui/Button';
import { DisclosureButton } from '../../ui/Disclosure';
import { KeyCombo, modKey } from '../../ui/Kbd';
import styles from './CodeEditor.module.css';

export interface CodeEditorProps {
  onRun?: () => void;
}

export const CodeEditor: React.FC<CodeEditorProps> = ({ onRun }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);

  const language = useSessionStore((s) => s.language);
  const code = useSessionStore((s) => s.codeByLanguage[s.language]);
  const setCode = useSessionStore((s) => s.setCode);
  const isStale = useSessionStore((s) => s.isStale);
  const trace = useSessionStore((s) => s.trace);
  const stdin = useSessionStore((s) => s.stdin);
  const setStdin = useSessionStore((s) => s.setStdin);

  const currentStepIndex = usePlaybackStore((s) => s.currentStepIndex);
  const breakpoints = usePlaybackStore((s) => s.breakpoints);
  const toggleBreakpoint = usePlaybackStore((s) => s.toggleBreakpoint);

  const [stdinOpen, setStdinOpen] = useState(false);

  useEffect(() => {
    if (!containerRef.current) return;

    const langExtension = language === 'python' ? python() : cpp();

    const state = EditorState.create({
      doc: code,
      extensions: [
        lineNumbers(),
        createExecGutter((line) => toggleBreakpoint(line)),
        langExtension,
        tracelTheme,
        tracelSyntaxHighlight,
        execLineField,
        keymap.of([
          indentWithTab,
          ...defaultKeymap,
          {
            key: 'Mod-Enter',
            run: () => {
              if (onRun) onRun();
              return true;
            },
          },
          {
            key: 'F9',
            run: (view) => {
              const pos = view.state.selection.main.head;
              const line = view.state.doc.lineAt(pos).number;
              toggleBreakpoint(line);
              return true;
            },
          },
        ]),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            const newDoc = update.state.doc.toString();
            setCode(newDoc);
          }
        }),
      ],
    });

    const view = new EditorView({
      state,
      parent: containerRef.current,
    });

    viewRef.current = view;

    return () => {
      view.destroy();
      viewRef.current = null;
    };
  }, [language]);

  // Push external code changes (an example was picked) into the editor.
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const currentDoc = view.state.doc.toString();
    if (currentDoc !== code) {
      view.dispatch({
        changes: { from: 0, to: currentDoc.length, insert: code },
      });
    }
  }, [code]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    view.dispatch({
      effects: setBreakpointsEffect.of(breakpoints),
    });
  }, [breakpoints]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    if (!trace || trace.steps.length === 0) {
      view.dispatch({
        effects: setExecLineEffect.of({ currentLine: null, justRanLine: null, errorLine: null }),
      });
      return;
    }

    const currentState = stateAt(trace, currentStepIndex);
    const activeLine = currentState.step.line;
    const justRanLine =
      currentStepIndex > 0 ? trace.steps[currentStepIndex - 1]?.line ?? null : null;
    const errorLine = currentState.step.kind === 'exception' ? activeLine : null;

    view.dispatch({
      effects: setExecLineEffect.of({
        currentLine: activeLine,
        justRanLine,
        errorLine,
        range: currentState.step.range,
      }),
    });

    if (activeLine && activeLine > 0 && activeLine <= view.state.doc.lines) {
      try {
        const lineObj = view.state.doc.line(activeLine);
        const lineBlock = view.lineBlockAt(lineObj.from);

        // Only scroll when the line leaves the middle 60%, so stepping doesn't jitter.
        const scrollInfo = view.scrollDOM.getBoundingClientRect();
        const linePos = lineBlock.top - view.scrollDOM.scrollTop;

        if (linePos < scrollInfo.height * 0.2 || linePos > scrollInfo.height * 0.8) {
          view.dispatch({
            effects: EditorView.scrollIntoView(lineObj.from, { y: 'center' }),
          });
        }
      } catch {
        // Line no longer exists in the edited document.
      }
    }
  }, [trace, currentStepIndex]);

  return (
    <div className={styles.pane}>
      {isStale && (
        <div className={styles.stale} role="status">
          <span>Code changed since the last run.</span>
          {onRun && (
            <Button size="sm" variant="ghost" onClick={onRun}>
              Run again <KeyCombo keys={[modKey, '↵']} />
            </Button>
          )}
        </div>
      )}

      <div ref={containerRef} className={styles.editor} />

      <div className={styles.stdin}>
        <DisclosureButton block open={stdinOpen} aria-controls="stdin-input" onClick={() => setStdinOpen(!stdinOpen)}>
          Input (stdin)
          {!stdinOpen && stdin && <span className={styles.stdinHint}>{stdin.split('\n').length} lines</span>}
        </DisclosureButton>
        {stdinOpen && (
          <textarea
            id="stdin-input"
            aria-label="Input (stdin)"
            className={styles.stdinInput}
            value={stdin}
            onChange={(e) => setStdin(e.target.value)}
            placeholder="One value per line, read by input(), scanf or cin"
          />
        )}
      </div>
    </div>
  );
};

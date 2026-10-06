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
  const [execLineTop, setExecLineTop] = useState<number | null>(null);
  const [execLineHeight, setExecLineHeight] = useState<number>(22);

  // Initialize CodeMirror instance
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

  // Update doc if external code changes (e.g. example selected)
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

  // Update breakpoints
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    view.dispatch({
      effects: setBreakpointsEffect.of(breakpoints),
    });
  }, [breakpoints]);

  // Sync execution line and auto-scroll
  useEffect(() => {
    const view = viewRef.current;
    if (!view || !trace || trace.steps.length === 0) {
      setExecLineTop(null);
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

        setExecLineTop(lineBlock.top);
        setExecLineHeight(lineBlock.height);

        // Smart auto-scrolling: keep active line in middle 60% of viewport
        const scrollInfo = view.scrollDOM.getBoundingClientRect();
        const linePos = lineBlock.top - view.scrollDOM.scrollTop;

        if (linePos < scrollInfo.height * 0.2 || linePos > scrollInfo.height * 0.8) {
          view.dispatch({
            effects: EditorView.scrollIntoView(lineObj.from, { y: 'center' }),
          });
        }
      } catch {
        setExecLineTop(null);
      }
    } else {
      setExecLineTop(null);
    }
  }, [trace, currentStepIndex]);

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        width: '100%',
        height: '100%',
        backgroundColor: 'var(--bg-1)',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Stale Trace Banner */}
      {isStale && (
        <div
          style={{
            backgroundColor: 'var(--bg-3)',
            borderBottom: '1px solid var(--line-1)',
            padding: '4px 12px',
            fontSize: '11.5px',
            color: 'var(--text-2)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            zIndex: 10,
          }}
        >
          <span>Code changed · Run again (⌘↵) to retrace</span>
          {onRun && (
            <button
              onClick={onRun}
              style={{
                color: 'var(--exec)',
                fontWeight: 500,
                fontSize: '11.5px',
                cursor: 'pointer',
              }}
            >
              Retrace now
            </button>
          )}
        </div>
      )}

      {/* Editor View Container */}
      <div
        ref={containerRef}
        style={{
          flex: 1,
          height: '100%',
          overflow: 'auto',
          position: 'relative',
        }}
      >
        {/* Animated Execution Line Indicator */}
        {execLineTop !== null && (
          <div
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              top: 0,
              height: `${execLineHeight}px`,
              transform: `translateY(${execLineTop}px)`,
              transition: 'transform 200ms cubic-bezier(0.2, 0, 0, 1)',
              backgroundColor: 'var(--exec-dim)',
              borderLeft: '2px solid var(--exec)',
              pointerEvents: 'none',
              zIndex: 3,
            }}
          />
        )}
      </div>

      {/* Stdin Drawer */}
      <div
        style={{
          borderTop: '1px solid var(--line-1)',
          backgroundColor: 'var(--bg-2)',
        }}
      >
        <div
          onClick={() => setStdinOpen(!stdinOpen)}
          style={{
            padding: '4px 12px',
            fontSize: '11px',
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
            color: 'var(--text-3)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            cursor: 'pointer',
          }}
        >
          <span>Standard Input (Stdin)</span>
          <span style={{ fontSize: '10px' }}>{stdinOpen ? '▾' : '▸'}</span>
        </div>
        {stdinOpen && (
          <div style={{ padding: '0 12px 8px 12px' }}>
            <textarea
              value={stdin}
              onChange={(e) => setStdin(e.target.value)}
              placeholder="Input lines for input() / scanf / cin..."
              style={{
                width: '100%',
                height: '56px',
                backgroundColor: 'var(--bg-1)',
                border: '1px solid var(--line-2)',
                borderRadius: 'var(--r-4)',
                color: 'var(--text-1)',
                fontFamily: 'var(--font-mono)',
                fontSize: '12px',
                padding: '6px 8px',
                resize: 'none',
              }}
            />
          </div>
        )}
      </div>
    </div>
  );
};


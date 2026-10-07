import { Extension, StateField, StateEffect, RangeSet, Range } from '@codemirror/state';
import { EditorView, Decoration, GutterMarker, gutter } from '@codemirror/view';

export const setExecLineEffect = StateEffect.define<{
  currentLine: number | null;
  justRanLine: number | null;
  errorLine: number | null;
  range?: { from: number; to: number };
}>();

export const setBreakpointsEffect = StateEffect.define<Set<number>>();

class ClassMarker extends GutterMarker {
  constructor(private readonly className: string) {
    super();
  }
  eq(other: GutterMarker) {
    return other instanceof ClassMarker && other.className === this.className;
  }
  toDOM() {
    const el = document.createElement('span');
    el.className = this.className;
    return el;
  }
}

const execMarker = new ClassMarker('cm-marker-exec');
const breakpointMarker = new ClassMarker('cm-marker-breakpoint');
const errorMarker = new ClassMarker('cm-marker-error');

const currentLineDeco = Decoration.line({ class: 'cm-execLine' });
const justRanLineDeco = Decoration.line({ class: 'cm-justRanLine' });
const errorLineDeco = Decoration.line({ class: 'cm-errorLine' });

export interface ExecLineState {
  currentLine: number | null;
  justRanLine: number | null;
  errorLine: number | null;
  range?: { from: number; to: number };
  breakpoints: Set<number>;
}

export const execLineField = StateField.define<ExecLineState>({
  create() {
    return {
      currentLine: null,
      justRanLine: null,
      errorLine: null,
      breakpoints: new Set(),
    };
  },
  update(value, tr) {
    let next = value;
    for (const effect of tr.effects) {
      if (effect.is(setExecLineEffect)) {
        next = { ...next, ...effect.value };
      } else if (effect.is(setBreakpointsEffect)) {
        next = { ...next, breakpoints: new Set(effect.value) };
      }
    }
    return next;
  },
  provide: (f) =>
    EditorView.decorations.compute([f, 'doc'], (state) => {
      const { currentLine, justRanLine, errorLine } = state.field(f);
      const doc = state.doc;
      const decos: Range<Decoration>[] = [];
      const add = (line: number | null, deco: Decoration) => {
        if (line && line > 0 && line <= doc.lines) decos.push(deco.range(doc.line(line).from));
      };

      // An error line takes over the executing line; only one class per line.
      if (errorLine) add(errorLine, errorLineDeco);
      else add(currentLine, currentLineDeco);
      if (justRanLine !== currentLine && justRanLine !== errorLine) add(justRanLine, justRanLineDeco);

      return Decoration.set(decos, true);
    }),
});

export function createExecGutter(onToggleBreakpoint?: (line: number) => void): Extension {
  return gutter({
    class: 'cm-exec-gutter',
    markers(view) {
      const state = view.state.field(execLineField);
      const doc = view.state.doc;
      const markers: Range<GutterMarker>[] = [];
      const add = (line: number | null, marker: GutterMarker) => {
        if (line && line > 0 && line <= doc.lines) markers.push(marker.range(doc.line(line).from));
      };

      if (state.errorLine) add(state.errorLine, errorMarker);
      else add(state.currentLine, execMarker);

      for (const bp of state.breakpoints) {
        if (bp !== state.currentLine && bp !== state.errorLine) add(bp, breakpointMarker);
      }

      return RangeSet.of(markers, true);
    },
    domEventHandlers: {
      mousedown(view, line) {
        if (!onToggleBreakpoint) return false;
        onToggleBreakpoint(view.state.doc.lineAt(line.from).number);
        return true;
      },
    },
  });
}

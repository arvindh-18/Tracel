import {
  Extension,
  StateField,
  StateEffect,
  RangeSet,
} from '@codemirror/state';
import {
  EditorView,
  Decoration,
  DecorationSet,
  GutterMarker,
  gutter,
} from '@codemirror/view';

// State effects for execution lines and errors
export const setExecLineEffect = StateEffect.define<{
  currentLine: number | null;
  justRanLine: number | null;
  errorLine: number | null;
  range?: { from: number; to: number };
}>();

export const setBreakpointsEffect = StateEffect.define<Set<number>>();

class ExecGutterMarker extends GutterMarker {
  toDOM() {
    const el = document.createElement('span');
    el.style.color = 'var(--exec)';
    el.style.fontSize = '12px';
    el.style.fontWeight = 'bold';
    el.style.marginLeft = '2px';
    el.textContent = '▸';
    return el;
  }
}

class BreakpointMarker extends GutterMarker {
  toDOM() {
    const el = document.createElement('span');
    el.style.display = 'inline-block';
    el.style.width = '8px';
    el.style.height = '8px';
    el.style.borderRadius = '50%';
    el.style.backgroundColor = 'var(--sem-remove)';
    el.style.marginLeft = '4px';
    el.style.boxShadow = '0 0 4px var(--sem-remove)';
    return el;
  }
}

class ErrorGutterMarker extends GutterMarker {
  toDOM() {
    const el = document.createElement('span');
    el.style.color = 'var(--sem-remove)';
    el.style.fontSize = '12px';
    el.style.fontWeight = 'bold';
    el.style.marginLeft = '2px';
    el.textContent = '●';
    return el;
  }
}

const currentLineDeco = Decoration.line({
  attributes: {
    style:
      'background-color: var(--exec-dim); border-left: 2px solid var(--exec); transition: background-color 150ms ease;',
  },
});

const justRanLineDeco = Decoration.line({
  attributes: {
    style: 'border-left: 1px dashed var(--line-3);',
  },
});

const errorLineDeco = Decoration.line({
  attributes: {
    style:
      'background-color: var(--sem-remove-soft); border-left: 2px solid var(--sem-remove);',
  },
});

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
    let next = { ...value };
    for (const effect of tr.effects) {
      if (effect.is(setExecLineEffect)) {
        next = {
          ...next,
          currentLine: effect.value.currentLine,
          justRanLine: effect.value.justRanLine,
          errorLine: effect.value.errorLine,
          range: effect.value.range,
        };
      } else if (effect.is(setBreakpointsEffect)) {
        next = {
          ...next,
          breakpoints: new Set(effect.value),
        };
      }
    }
    return next;
  },
  provide: (f) =>
    EditorView.decorations.from(f, (state) => {
      const { currentLine, justRanLine, errorLine, range } = state;
      const builder: RangeSet<Decoration>[] = [];
      const decos: { pos: number; deco: Decoration }[] = [];

      // Line decorations
      if (errorLine && errorLine > 0 && errorLine <= 5000) {
        try {
          // decoration will be applied on line view
        } catch {}
      }

      return Decoration.none;
    }),
});

export function createExecGutter(onToggleBreakpoint?: (line: number) => void): Extension {
  return gutter({
    class: 'cm-exec-gutter',
    markers(view) {
      const state = view.state.field(execLineField);
      const markers: { from: number; marker: GutterMarker }[] = [];
      const doc = view.state.doc;

      if (state.currentLine && state.currentLine > 0 && state.currentLine <= doc.lines) {
        try {
          const line = doc.line(state.currentLine);
          markers.push({ from: line.from, marker: new ExecGutterMarker() });
        } catch {}
      }

      if (state.errorLine && state.errorLine > 0 && state.errorLine <= doc.lines) {
        try {
          const line = doc.line(state.errorLine);
          markers.push({ from: line.from, marker: new ErrorGutterMarker() });
        } catch {}
      }

      for (const bp of state.breakpoints) {
        if (bp > 0 && bp <= doc.lines && bp !== state.currentLine) {
          try {
            const line = doc.line(bp);
            markers.push({ from: line.from, marker: new BreakpointMarker() });
          } catch {}
        }
      }

      markers.sort((a, b) => a.from - b.from);
      const rangeSet = RangeSet.of(markers.map((m) => m.marker.range(m.from)));
      return rangeSet;
    },
    domEventHandlers: {
      mousedown(view, line) {
        if (onToggleBreakpoint) {
          const lineNo = view.state.doc.lineAt(line.from).number;
          onToggleBreakpoint(lineNo);
          return true;
        }
        return false;
      },
    },
  });
}


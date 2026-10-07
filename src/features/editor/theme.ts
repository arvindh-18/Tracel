import { EditorView } from '@codemirror/view';
import { Extension } from '@codemirror/state';
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { tags as t } from '@lezer/highlight';

// Colors are CSS variables only, so this one extension serves both themes
// and a theme switch needs no editor reconfiguration.
export const tracelTheme = EditorView.theme({
  '&': {
    color: 'var(--text-1)',
    backgroundColor: 'var(--bg-surface)',
    fontSize: 'var(--fs-code)',
    height: '100%',
  },
  '.cm-scroller': {
    fontFamily: 'var(--font-mono)',
    lineHeight: 'var(--lh-code)',
  },
  '.cm-content': {
    caretColor: 'var(--text-1)',
    padding: 'var(--sp-8) 0',
  },
  '.cm-cursor, .cm-dropCursor': {
    borderLeftColor: 'var(--text-1)',
  },
  '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection': {
    backgroundColor: 'var(--selection-bg)',
  },
  '.cm-activeLine': {
    backgroundColor: 'transparent',
  },
  '.cm-gutters': {
    backgroundColor: 'var(--bg-surface)',
    color: 'var(--text-3)',
    border: 'none',
    borderRight: '1px solid var(--line-1)',
  },
  '.cm-lineNumbers .cm-gutterElement': {
    padding: '0 var(--sp-8) 0 var(--sp-12)',
    minWidth: 'var(--sp-32)',
    fontVariantNumeric: 'tabular-nums',
  },
  '.cm-exec-gutter': {
    width: 'var(--sp-16)',
    cursor: 'pointer',
  },
  '.cm-exec-gutter .cm-gutterElement': {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  '.cm-marker-exec': {
    width: 0,
    height: 0,
    borderTop: 'var(--sp-4) solid transparent',
    borderBottom: 'var(--sp-4) solid transparent',
    borderLeft: 'var(--sp-8) solid var(--exec)',
  },
  '.cm-marker-breakpoint': {
    width: 'var(--sp-8)',
    height: 'var(--sp-8)',
    borderRadius: '50%',
    backgroundColor: 'var(--sem-remove)',
  },
  '.cm-marker-error': {
    width: 'var(--sp-8)',
    height: 'var(--sp-8)',
    borderRadius: '50%',
    border: '2px solid var(--sem-remove)',
  },
  '.cm-line.cm-execLine': {
    backgroundColor: 'var(--exec-line-bg)',
    boxShadow: 'inset 2px 0 0 var(--exec)',
  },
  '.cm-line.cm-justRanLine': {
    boxShadow: 'inset 2px 0 0 var(--line-3)',
  },
  '.cm-line.cm-errorLine': {
    backgroundColor: 'var(--sem-remove-soft)',
    boxShadow: 'inset 2px 0 0 var(--sem-remove)',
  },
  '.cm-foldPlaceholder': {
    backgroundColor: 'transparent',
    border: 'none',
    color: 'var(--text-3)',
  },
  '.cm-panels': {
    backgroundColor: 'var(--bg-raised)',
    color: 'var(--text-1)',
  },
  '.cm-tooltip': {
    border: '1px solid var(--line-2)',
    backgroundColor: 'var(--bg-raised)',
    borderRadius: 'var(--r-control)',
    boxShadow: 'var(--shadow-float)',
  },
});

export const tracelHighlightStyle = HighlightStyle.define([
  { tag: [t.keyword, t.controlKeyword, t.moduleKeyword, t.definitionKeyword], color: 'var(--syn-keyword)' },
  { tag: [t.name, t.deleted, t.character, t.propertyName, t.macroName], color: 'var(--text-1)' },
  { tag: [t.function(t.variableName), t.function(t.propertyName), t.labelName], color: 'var(--syn-function)' },
  { tag: [t.typeName, t.className, t.namespace, t.standard(t.name), t.constant(t.name)], color: 'var(--syn-type)' },
  { tag: [t.definition(t.name), t.separator, t.punctuation], color: 'var(--text-1)' },
  { tag: [t.number, t.bool, t.atom, t.self, t.special(t.variableName)], color: 'var(--syn-number)' },
  { tag: [t.operator, t.operatorKeyword, t.escape, t.regexp, t.special(t.string)], color: 'var(--syn-operator)' },
  { tag: [t.string, t.processingInstruction, t.inserted], color: 'var(--syn-string)' },
  { tag: [t.meta, t.comment], color: 'var(--syn-comment)', fontStyle: 'italic' },
  { tag: t.strong, fontWeight: '600' },
  { tag: t.emphasis, fontStyle: 'italic' },
  { tag: t.strikethrough, textDecoration: 'line-through' },
  { tag: t.link, color: 'var(--sem-ref)', textDecoration: 'underline' },
  { tag: t.invalid, color: 'var(--sem-remove)' },
]);

export const tracelSyntaxHighlight: Extension = syntaxHighlighting(tracelHighlightStyle);

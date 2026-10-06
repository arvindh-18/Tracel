import { EditorView } from '@codemirror/view';
import { Extension } from '@codemirror/state';
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { tags as t } from '@lezer/highlight';

export const tracelTheme = EditorView.theme(
  {
    '&': {
      color: 'var(--text-1)',
      backgroundColor: 'var(--bg-1)',
      fontFamily: 'var(--font-mono)',
      fontSize: '13.5px',
      lineHeight: '22px',
      height: '100%',
    },
    '.cm-content': {
      caretColor: 'var(--exec)',
      padding: '8px 0',
    },
    '&.cm-focused .cm-cursor': {
      borderLeftColor: 'var(--exec)',
      borderLeftWidth: '2px',
    },
    '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection': {
      backgroundColor: 'rgba(255, 181, 71, 0.2) !important',
    },
    '.cm-panels': {
      backgroundColor: 'var(--bg-2)',
      color: 'var(--text-1)',
    },
    '.cm-panels.cm-panels-top': {
      borderBottom: '1px solid var(--line-1)',
    },
    '.cm-panels.cm-panels-bottom': {
      borderTop: '1px solid var(--line-1)',
    },
    '.cm-gutters': {
      backgroundColor: 'var(--bg-1)',
      color: 'var(--text-3)',
      borderRight: '1px solid var(--line-1)',
      paddingRight: '6px',
    },
    '.cm-activeLineGutter': {
      color: 'var(--exec)',
      backgroundColor: 'transparent',
    },
    '.cm-lineNumbers .cm-gutterElement': {
      paddingLeft: '10px',
      minWidth: '32px',
      cursor: 'pointer',
    },
    '.cm-foldPlaceholder': {
      backgroundColor: 'transparent',
      border: 'none',
      color: 'var(--text-3)',
    },
    '.cm-tooltip': {
      border: '1px solid var(--line-2)',
      backgroundColor: 'var(--bg-2)',
      borderRadius: 'var(--r-6)',
      boxShadow: 'var(--shadow-popover)',
    },
    '.cm-tooltip .cm-tooltip-arrow:before': {
      borderTopColor: 'transparent',
      borderBottomColor: 'transparent',
    },
    '.cm-tooltip .cm-tooltip-arrow:after': {
      borderTopColor: 'var(--bg-2)',
      borderBottomColor: 'var(--bg-2)',
    },
  },
  { dark: true }
);

export const tracelHighlightStyle = HighlightStyle.define([
  { tag: t.keyword, color: 'var(--syn-keyword)' },
  { tag: [t.name, t.deleted, t.character, t.propertyName, t.macroName], color: 'var(--text-1)' },
  { tag: [t.function(t.variableName), t.labelName], color: 'var(--syn-function)', fontWeight: '500' },
  { tag: [t.color, t.constant(t.name), t.standard(t.name)], color: 'var(--syn-builtin)' },
  { tag: [t.definition(t.name), t.separator], color: 'var(--text-1)' },
  { tag: [t.typeName, t.className, t.number, t.changed, t.annotation, t.modifier, t.self, t.namespace], color: 'var(--syn-number)' },
  { tag: [t.operator, t.operatorKeyword, t.url, t.escape, t.regexp, t.link, t.special(t.string)], color: 'var(--syn-operator)' },
  { tag: [t.meta, t.comment], color: 'var(--syn-comment)', fontStyle: 'italic' },
  { tag: t.strong, fontWeight: 'bold' },
  { tag: t.emphasis, fontStyle: 'italic' },
  { tag: t.strikethrough, textDecoration: 'line-through' },
  { tag: t.link, color: 'var(--sem-ref)', textDecoration: 'underline' },
  { tag: t.heading, fontWeight: 'bold', color: 'var(--text-1)' },
  { tag: [t.atom, t.bool, t.special(t.variableName)], color: 'var(--syn-number)' },
  { tag: [t.processingInstruction, t.string, t.inserted], color: 'var(--syn-string)' },
  { tag: t.invalid, color: 'var(--sem-remove)' },
]);

export const tracelSyntaxHighlight: Extension = syntaxHighlighting(tracelHighlightStyle);


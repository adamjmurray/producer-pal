// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { type Extension } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { tags as t } from "@lezer/highlight";

const headingStyle = (size: string, weight = "600") => ({
  fontSize: size,
  fontWeight: weight,
  lineHeight: "1.25",
});

const markdownHighlightStyle = HighlightStyle.define([
  { tag: t.heading1, ...headingStyle("1.6em", "700") },
  { tag: t.heading2, ...headingStyle("1.4em", "700") },
  { tag: t.heading3, ...headingStyle("1.2em") },
  { tag: t.heading4, ...headingStyle("1.1em") },
  { tag: t.heading5, ...headingStyle("1em") },
  { tag: t.heading6, ...headingStyle("0.95em") },
  { tag: t.strong, fontWeight: "700" },
  { tag: t.emphasis, fontStyle: "italic" },
  { tag: t.strikethrough, textDecoration: "line-through" },
  {
    tag: t.monospace,
    fontFamily:
      "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
  },
  { tag: t.link, textDecoration: "underline" },
  { tag: t.url, textDecoration: "underline" },
  { tag: t.list, fontWeight: "500" },
  { tag: t.quote, fontStyle: "italic" },
  // Tone down markdown punctuation (#, *, _, `, etc).
  { tag: t.processingInstruction, opacity: "0.5" },
  { tag: t.meta, opacity: "0.5" },
]);

// Single theme. Text color and caret inherit from the Tailwind-styled
// wrapper, so `dark:text-...` on the host element controls visibility in
// both light and dark modes. Selection backgrounds are set explicitly per
// mode using an ancestor selector keyed on the `html.dark` class set by
// useTheme().
const editorTheme = EditorView.theme({
  "&": {
    height: "100%",
    fontSize: "0.95rem",
    backgroundColor: "transparent",
    color: "inherit",
  },
  ".cm-scroller": {
    fontFamily:
      "ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
    lineHeight: "1.55",
    padding: "1rem",
  },
  ".cm-content": {
    color: "inherit",
    caretColor: "currentColor",
  },
  "&.cm-focused": {
    outline: "none",
  },
  ".cm-line": {
    padding: "0 0.25rem",
  },
  ".cm-cursor, .cm-dropCursor": {
    borderLeftColor: "currentColor",
  },
  // Light-mode selection (default).
  "&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection":
    {
      backgroundColor: "rgb(228 228 231)", // zinc-200
    },
  // Dark-mode selection — `html.dark` is set by useTheme() on document root.
  "html.dark &.cm-focused .cm-selectionBackground, html.dark .cm-selectionBackground, html.dark ::selection":
    {
      backgroundColor: "rgb(63 63 70)", // zinc-700
    },
});

/** CodeMirror extensions providing markdown styling for both themes. */
export const markdownEditorTheme: Extension[] = [
  editorTheme,
  syntaxHighlighting(markdownHighlightStyle),
];

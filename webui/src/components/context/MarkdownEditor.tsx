// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { markdown } from "@codemirror/lang-markdown";
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { Compartment, EditorState, type Extension } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";
import { tags as t } from "@lezer/highlight";
import { useEffect, useRef } from "preact/hooks";

interface MarkdownEditorProps {
  /**
   * Content used to seed the editor at mount. After mount the editor owns
   * its own state — changes to this prop are intentionally ignored. To force
   * a reset (e.g. a "Clear" action), remount the component via a `key` prop.
   */
  initialValue: string;
  readOnly: boolean;
  onChange: (value: string) => void;
  onFocus?: () => void;
  onBlur?: () => void;
  className?: string;
}

/**
 * Uncontrolled CodeMirror 6 markdown editor. The editor instance owns its
 * document; the parent reads changes via `onChange` but does NOT feed them
 * back as props. This deliberately rules out the controlled round-trip that
 * could otherwise loop (editor change → setState → new value prop → dispatch
 * → updateListener → setState → …) if any normalization ever diverged.
 * Wrapped in a card-style frame so the editable region reads as an input,
 * not page background.
 * @param props - Editor props
 * @returns Editor element
 */
export function MarkdownEditor(props: MarkdownEditorProps): preact.JSX.Element {
  const { initialValue, readOnly, onChange, onFocus, onBlur, className } =
    props;
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const readOnlyCompartment = useRef(new Compartment());
  const onChangeRef = useRef(onChange);
  const onFocusRef = useRef(onFocus);
  const onBlurRef = useRef(onBlur);

  // Keep callback refs current. Updating in an effect (vs. during render)
  // satisfies react-hooks/refs and keeps the editor instance stable.
  useEffect(() => {
    onChangeRef.current = onChange;
    onFocusRef.current = onFocus;
    onBlurRef.current = onBlur;
  }, [onChange, onFocus, onBlur]);

  useEffect(() => {
    // Ref is set by the rendered <div ref={containerRef} />; always defined
    // when this effect runs.
    const container = containerRef.current as HTMLDivElement;

    const updateListener = EditorView.updateListener.of((update) => {
      if (update.docChanged) {
        onChangeRef.current(update.state.doc.toString());
      }

      if (update.focusChanged) {
        notifyFocusChange(
          update.view.hasFocus,
          onFocusRef.current,
          onBlurRef.current,
        );
      }
    });

    const view = new EditorView({
      state: EditorState.create({
        doc: initialValue,
        extensions: [
          history(),
          keymap.of([...defaultKeymap, ...historyKeymap]),
          markdown(),
          EditorView.lineWrapping,
          markdownEditorTheme,
          updateListener,
          readOnlyCompartment.current.of(EditorState.readOnly.of(readOnly)),
        ],
      }),
      parent: container,
    });

    viewRef.current = view;

    return () => {
      view.destroy();
      viewRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally seed-only: the editor is uncontrolled. To reset, the parent remounts via `key`.
  }, []);

  // Toggle read-only via compartment so we don't recreate the editor.
  useEffect(() => {
    const view = viewRef.current as EditorView;

    view.dispatch({
      effects: readOnlyCompartment.current.reconfigure(
        EditorState.readOnly.of(readOnly),
      ),
    });
  }, [readOnly]);

  // Frame the editable region so it visually reads as an input, not page bg.
  // Inner host is the CodeMirror parent; outer is the frame + focus ring.
  const frameClass =
    "rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800/50 focus-within:ring-2 focus-within:ring-blue-500/40 focus-within:border-blue-500/60 overflow-hidden flex flex-col";
  const wrapperClass = className ? `${frameClass} ${className}` : frameClass;

  return (
    <div className={wrapperClass}>
      <div
        ref={containerRef}
        className="text-zinc-900 dark:text-zinc-200 flex-1 min-h-0 overflow-auto"
      />
    </div>
  );
}

// --- Helpers below main export ---

/**
 * Heading style block shared by the six markdown heading levels.
 * @param size - CSS font size (e.g. "1.4em")
 * @param weight - CSS font weight (defaults to "600")
 * @returns A CodeMirror highlight-style declaration
 */
const headingStyle = (
  size: string,
  weight = "600",
): { fontSize: string; fontWeight: string; lineHeight: string } => ({
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
const markdownEditorTheme: Extension[] = [
  editorTheme,
  syntaxHighlighting(markdownHighlightStyle),
];

/**
 * Dispatch a focus or blur callback based on whether the editor has focus.
 * Extracted so it can be unit-tested directly — happy-dom doesn't reliably
 * drive CodeMirror's focus tracking.
 * @param hasFocus - Editor focus state after the update
 * @param onFocus - Focus callback (optional)
 * @param onBlur - Blur callback (optional)
 */
export function notifyFocusChange(
  hasFocus: boolean,
  onFocus: (() => void) | undefined,
  onBlur: (() => void) | undefined,
): void {
  if (hasFocus) {
    onFocus?.();
  } else {
    onBlur?.();
  }
}

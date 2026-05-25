// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import { markdown } from "@codemirror/lang-markdown";
import { Compartment, EditorState } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";
import { useEffect, useRef } from "preact/hooks";
import { markdownEditorTheme } from "./markdown-editor-theme";

interface MarkdownEditorProps {
  value: string;
  readOnly: boolean;
  onChange: (value: string) => void;
  onFocus?: () => void;
  onBlur?: () => void;
  className?: string;
}

/**
 * CodeMirror 6 markdown editor. Owns the editor instance and reconciles
 * external `value` updates against the buffer. Refs for callbacks keep the
 * editor instance stable across renders.
 * @param props - Editor props
 * @returns Editor element
 */
export function MarkdownEditor(props: MarkdownEditorProps): preact.JSX.Element {
  const { value, readOnly, onChange, onFocus, onBlur, className } = props;
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
  });

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
        doc: value,
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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- editor is created once; subsequent prop changes flow through the dedicated effects below
  }, []);

  // Sync external value into the editor (e.g. server refresh after AI write).
  useEffect(() => {
    // viewRef is populated by the mount effect, which runs before this one.
    const view = viewRef.current as EditorView;
    const current = view.state.doc.toString();

    if (current === value) return;

    view.dispatch({
      changes: { from: 0, to: current.length, insert: value },
    });
  }, [value]);

  // Toggle read-only via compartment so we don't recreate the editor.
  useEffect(() => {
    const view = viewRef.current as EditorView;

    view.dispatch({
      effects: readOnlyCompartment.current.reconfigure(
        EditorState.readOnly.of(readOnly),
      ),
    });
  }, [readOnly]);

  // Tailwind text color drives the editor's inherited color (and caret) so
  // the editor stays visible in both light and dark modes.
  const extraClass = className ? ` ${className}` : "";
  const hostClass = `text-zinc-900 dark:text-zinc-200${extraClass}`;

  return <div ref={containerRef} className={hostClass} />;
}

// --- Helpers below main export ---

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

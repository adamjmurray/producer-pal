// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { Compartment, EditorState } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { useEffect, useRef } from "preact/hooks";
import { markdownEditorExtensions } from "./markdown-editor-extensions";
import { notifyFocusChange } from "./markdown-editor-helpers";

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
  /**
   * Accessible name for the editable region, applied to the content DOM via
   * CodeMirror's contentAttributes. Read once at mount like the seed props.
   * Set it wherever a plain `<textarea>` would have carried a label (the
   * memory / custom-skill body, the skills preview) so the editor isn't a
   * nameless textbox to screen readers.
   */
  ariaLabel?: string;
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
  const { ariaLabel } = props;
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
          markdownEditorExtensions,
          ...(ariaLabel != null
            ? [EditorView.contentAttributes.of({ "aria-label": ariaLabel })]
            : []),
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
        className="min-h-0 flex-1 overflow-auto text-zinc-900 dark:text-zinc-200"
      />
    </div>
  );
}

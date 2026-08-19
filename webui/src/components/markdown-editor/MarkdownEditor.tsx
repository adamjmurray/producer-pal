// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { Compartment, EditorState, Transaction } from "@codemirror/state";
import { EditorView, placeholder as placeholderExt } from "@codemirror/view";
import {
  type MutableRef,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
} from "preact/hooks";
import {
  chatInputExtensions,
  markdownEditorExtensions,
} from "./markdown-editor-extensions";
import {
  editableConfig,
  frameClassName,
  notifyFocusChange,
  submitKeymap,
} from "./markdown-editor-helpers";

/** Imperative handle a parent can hold to drive the editor between renders. */
export interface MarkdownEditorHandle {
  /** Empty the document without dropping focus. */
  clear: () => void;
  focus: () => void;
}

interface MarkdownEditorProps {
  /**
   * Content used to seed the editor at mount. After mount the editor owns
   * its own state — changes to this prop are intentionally ignored. To force
   * a reset (e.g. a "Clear" action), remount the component via a `key` prop.
   */
  initialValue: string;
  /** Block edits but keep focus and selection (a preview). */
  readOnly?: boolean;
  /** Block edits and focus, dimmed like a disabled form control. */
  disabled?: boolean;
  /** Hint shown while the document is empty. */
  placeholder?: string;
  onChange: (value: string) => void;
  onFocus?: () => void;
  onBlur?: () => void;
  /**
   * When set, Enter submits and Shift+Enter inserts a newline (still
   * continuing a list). Read once at mount; the latest callback is called.
   */
  onSubmit?: () => void;
  /** Receives a {@link MarkdownEditorHandle} while mounted, null after. */
  editorRef?: MutableRef<MarkdownEditorHandle | null>;
  className?: string;
  /**
   * Accessible name for the editable region, applied to the content DOM via
   * CodeMirror's contentAttributes. Read once at mount like the seed props.
   * Set it wherever a plain `<textarea>` would have carried a label (the
   * memory / custom-skill body, the skills preview) so the editor isn't a
   * nameless textbox to screen readers.
   */
  ariaLabel?: string;
  /**
   * `card` (default) fills its container like a document pane. `chat` sizes
   * to its content — two lines minimum, scrolling past ~40vh — with the chat
   * input's tighter padding and frame. Read once at mount.
   */
  variant?: "card" | "chat";
}

/**
 * Uncontrolled CodeMirror 6 markdown editor. The editor instance owns its
 * document; the parent reads changes via `onChange` but does NOT feed them
 * back as props. This deliberately rules out the controlled round-trip that
 * could otherwise loop (editor change → setState → new value prop → dispatch
 * → updateListener → setState → …) if any normalization ever diverged.
 * Wrapped in a frame so the editable region reads as an input, not page
 * background.
 * @param props - Editor props
 * @returns Editor element
 */
export function MarkdownEditor(props: MarkdownEditorProps): preact.JSX.Element {
  const { initialValue, onChange, onFocus, onBlur, onSubmit } = props;
  const { readOnly = false, disabled = false, placeholder } = props;
  const { className, ariaLabel, editorRef, variant = "card" } = props;
  // Tab indents here, so the way out is Escape-then-Tab. Nothing on screen can
  // say so, hence a screen-reader-only description on the editable region.
  const tabHintId = useId();
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const editableCompartment = useRef(new Compartment());
  const placeholderCompartment = useRef(new Compartment());
  const onChangeRef = useRef(onChange);
  const onFocusRef = useRef(onFocus);
  const onBlurRef = useRef(onBlur);
  const onSubmitRef = useRef(onSubmit);

  // Keep callback refs current. Updating in an effect (vs. during render)
  // satisfies react-hooks/refs and keeps the editor instance stable. A layout
  // effect, so a keystroke right after a re-render (Enter on the heels of the
  // change that enabled submit) can't reach a stale callback.
  useLayoutEffect(() => {
    onChangeRef.current = onChange;
    onFocusRef.current = onFocus;
    onBlurRef.current = onBlur;
    onSubmitRef.current = onSubmit;
  }, [onChange, onFocus, onBlur, onSubmit]);

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
          ...(variant === "chat" ? [chatInputExtensions] : []),
          markdownEditorExtensions,
          EditorView.contentAttributes.of({ "aria-describedby": tabHintId }),
          ...(ariaLabel != null
            ? [EditorView.contentAttributes.of({ "aria-label": ariaLabel })]
            : []),
          ...(onSubmit != null
            ? [submitKeymap(() => onSubmitRef.current?.())]
            : []),
          updateListener,
          editableCompartment.current.of(editableConfig(readOnly, disabled)),
          placeholderCompartment.current.of(
            placeholder != null ? placeholderExt(placeholder) : [],
          ),
        ],
      }),
      parent: container,
    });

    viewRef.current = view;

    if (editorRef != null) {
      editorRef.current = {
        clear: () => {
          // Not undoable: Ctrl+Z after send must not bring the message back.
          view.dispatch({
            changes: { from: 0, to: view.state.doc.length, insert: "" },
            annotations: Transaction.addToHistory.of(false),
          });
        },
        focus: () => view.focus(),
      };
    }

    return () => {
      view.destroy();
      viewRef.current = null;
      if (editorRef != null) editorRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally seed-only: the editor is uncontrolled. To reset, the parent remounts via `key`.
  }, []);

  // Toggle read-only / disabled via compartment so we don't recreate the editor.
  useEffect(() => {
    const view = viewRef.current as EditorView;

    view.dispatch({
      effects: editableCompartment.current.reconfigure(
        editableConfig(readOnly, disabled),
      ),
    });
  }, [readOnly, disabled]);

  useEffect(() => {
    const view = viewRef.current as EditorView;

    view.dispatch({
      effects: placeholderCompartment.current.reconfigure(
        placeholder != null ? placeholderExt(placeholder) : [],
      ),
    });
  }, [placeholder]);

  // Frame the editable region so it visually reads as an input, not page bg.
  // Inner host is the CodeMirror parent; outer is the frame + focus ring.
  return (
    <div className={frameClassName(variant, disabled, className)}>
      <div
        ref={containerRef}
        className="min-h-0 flex-1 overflow-auto text-zinc-900 dark:text-zinc-200"
      />
      <span id={tabHintId} className="sr-only">
        Tab indents. Press Escape then Tab to move focus out of the editor.
      </span>
    </div>
  );
}

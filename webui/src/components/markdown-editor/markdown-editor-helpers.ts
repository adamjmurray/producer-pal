// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { insertNewlineContinueMarkup } from "@codemirror/lang-markdown";
import { EditorState, type Extension, Prec } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";

/**
 * Dispatch a focus or blur callback based on whether the editor has focus.
 * Separate from the component so it can be unit-tested directly — happy-dom
 * doesn't reliably drive CodeMirror's focus tracking.
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

/**
 * Enter submits, Shift+Enter inserts a newline (continuing a list item the
 * way plain Enter does elsewhere). `Prec.highest` so it beats both the
 * markdown keymap's Enter (`Prec.high`) and the default keymap's.
 * @param onSubmit - Called on Enter
 * @returns The keymap extension
 */
export function submitKeymap(onSubmit: () => void): Extension {
  return Prec.highest(
    keymap.of([
      {
        key: "Enter",
        run: (view) => {
          // Mid-composition Enter commits IME text; leave it to the browser.
          if (view.composing) return false;
          onSubmit();

          return true;
        },
      },
      { key: "Shift-Enter", run: insertNewlineContinueMarkup },
    ]),
  );
}

/**
 * The read-only / editable state for a compartment. `readOnly` blocks edits
 * but keeps focus and selection; `disabled` also drops focus (contenteditable
 * off), like a disabled form control.
 * @param readOnly - Block edits
 * @param disabled - Block edits and focus
 * @returns The extensions for the editable compartment
 */
export function editableConfig(
  readOnly: boolean,
  disabled: boolean,
): Extension {
  return [
    EditorState.readOnly.of(readOnly || disabled),
    EditorView.editable.of(!disabled),
  ];
}

const BASE_FRAME_CLASS =
  "border focus-within:ring-2 focus-within:ring-blue-500/40 focus-within:border-blue-500/60 overflow-hidden flex flex-col";

const VARIANT_FRAME_CLASS = {
  card: "rounded-md border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-800/50",
  chat: "rounded-lg border-zinc-300 dark:border-zinc-600 bg-zinc-50 dark:bg-zinc-800 shadow-inner",
};

/**
 * Tailwind classes for the editor's outer frame.
 * @param variant - Which look to render
 * @param disabled - Dim the frame like a disabled control
 * @param className - Extra classes from the parent (sizing, usually)
 * @returns The class string
 */
export function frameClassName(
  variant: "card" | "chat",
  disabled: boolean,
  className: string | undefined,
): string {
  return [
    BASE_FRAME_CLASS,
    VARIANT_FRAME_CLASS[variant],
    disabled ? "opacity-50" : "",
    className ?? "",
  ]
    .filter((c) => c !== "")
    .join(" ");
}

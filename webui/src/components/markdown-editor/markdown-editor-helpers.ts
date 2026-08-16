// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

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

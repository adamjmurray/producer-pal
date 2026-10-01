// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// Names the clip a transform warning was raised for.
//
// A multi-clip update runs the evaluator once per clip, and the same reason
// fires identically each time — "ratchet() grid must be greater than 0" five
// times says nothing about which five clips. The transform module has no
// LiveAPI and shouldn't take one, so the label comes from the tool.
//
// The label is module state rather than a parameter because roughly fifty
// warning sites across ten files would otherwise each need one threaded down to
// it. Files here import this module as `console`, so a warning site needs no
// change at all.
//
// Safe only because withClipWarningLabel's callback is synchronous: nothing
// else can run between setting the label and restoring it. Do not wrap
// anything that awaits — the label would leak onto another request's warnings,
// the way an unmanaged warning capture does.

import * as maxConsole from "#src/shared/max/v8-max-console.ts";

let clipLabel: string | undefined;
let clipSink: ((message: string) => void) | undefined;

/**
 * Run a transform with every warning it raises naming the clip it was for.
 * @param label - How to name the clip, or undefined to leave warnings bare
 * @param run - The transform work; must be synchronous
 * @param sink - Where {@link clipDetail} facts go instead of a warning, when the
 *   caller reports them on the clip's own entry
 * @returns Whatever run returns
 */
export function withClipWarningLabel<T>(
  label: string | undefined,
  run: () => T,
  sink?: (message: string) => void,
): T {
  const previous = clipLabel;
  const previousSink = clipSink;

  clipLabel = label;
  clipSink = sink;

  try {
    return run();
  } finally {
    clipLabel = previous;
    clipSink = previousSink;
  }
}

/**
 * Report a fact about the clip a transform ran for (something skipped, changed
 * or clamped on it): the caller's sink takes it when there is one (the clip's
 * entry), else it is a warning.
 * @param message - What happened on the clip, short enough to read as detail
 */
export function clipDetail(message: string): void {
  if (clipSink == null) {
    warn(message);
  } else {
    clipSink(message);
  }
}

/**
 * Warn, naming the clip when a transform is running for one.
 * @param message - The warning text
 */
export function warn(message: string): void {
  maxConsole.warn(clipLabel == null ? message : `${clipLabel}: ${message}`);
}

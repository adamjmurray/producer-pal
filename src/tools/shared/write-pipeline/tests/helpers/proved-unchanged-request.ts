// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import {
  type WarningCapture,
  beginWarningCapture,
  recordWriteRun,
} from "#src/shared/max/v8-warning-capture.ts";

/**
 * A new request whose write run proved it changed nothing, as the pipeline
 * reports a lone skip, so a helper tested on its own can show that only what
 * it leaves behind makes the request a change.
 * @returns The request's capture
 */
export function provedUnchangedRequest(): WarningCapture {
  const capture = beginWarningCapture();

  recordWriteRun(true);

  return capture;
}

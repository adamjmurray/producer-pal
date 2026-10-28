// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { recordWriteRun } from "#src/shared/max/v8-warning-capture.ts";

/**
 * Say that Live changed something that stays even if the target ends as a skip
 * (empty chains or scenes made on the way, a stray copy). The entry is
 * unchanged, but the call no longer counts as changing nothing, so Node closes
 * its undo step: otherwise what was left joins the next call's step.
 *
 * Call it where the change is made. It marks the request in flight, so a
 * helper deep in a write needs nothing passed down to it.
 */
export function markSetChanged(): void {
  recordWriteRun(false);
}

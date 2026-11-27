// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { emitWarning } from "#src/shared/max/v8-max-console.ts";

// At most this many distinct reasons are named; the rest collapse into a count.
// A model only needs to see what KIND of thing it got wrong, and the warning
// spends the user's context window.
const MAX_REPORTED_REASONS = 3;

/**
 * Warn about notes that were dropped and values that were clamped, one warning
 * each, naming every distinct reason with its count. Silence is the failure
 * mode worth avoiding: a model that wrote 8 notes and got 7, or asked for
 * velocity 200 and got 127, otherwise has nothing to notice.
 *
 * @param source - Where the notes came from, e.g. "MIDI JSON" or "code"
 * @param dropped - One reason per dropped note, in input order
 * @param clamped - One reason per clamped value, in input order
 */
export function warnNoteProblems(
  source: string,
  dropped: string[],
  clamped: string[],
): void {
  if (dropped.length > 0) {
    emitWarning(
      `ignoring ${dropped.length} invalid ${source} ${
        dropped.length === 1 ? "note" : "notes"
      }: ${summarizeReasons(dropped)}`,
    );
  }

  if (clamped.length > 0) {
    emitWarning(
      `clamped ${clamped.length} out-of-range ${source} ${
        clamped.length === 1 ? "value" : "values"
      }: ${summarizeReasons(clamped)}`,
    );
  }
}

/**
 * List each distinct reason with its count, most frequent first.
 *
 * @param reasons - One reason per affected note or value
 * @returns Comma-separated summary
 */
function summarizeReasons(reasons: string[]): string {
  const counts = new Map<string, number>();

  for (const reason of reasons) {
    counts.set(reason, (counts.get(reason) ?? 0) + 1);
  }

  // Biggest first. In input order the reason behind most of the problems gets
  // collapsed into "and N more" behind whatever happened to fail first, which
  // steers the model at the wrong mistake.
  const listed = [...counts.entries()]
    .toSorted(([, a], [, b]) => b - a)
    .slice(0, MAX_REPORTED_REASONS)
    .map(([reason, count]) => (count > 1 ? `${reason} (${count})` : reason));

  const hidden = counts.size - listed.length;

  return hidden > 0
    ? `${listed.join(", ")}, and ${hidden} more`
    : listed.join(", ");
}

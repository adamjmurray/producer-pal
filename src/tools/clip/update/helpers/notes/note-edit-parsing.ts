// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { parseNotation } from "#src/notation/notation.ts";
import { tryParseTransform } from "#src/notation/transform/transform-evaluator.ts";

/** The note edits one update-clip call sends a MIDI clip. */
export interface NoteEdits {
  notationString?: string;
  transformString?: string;
  preTransformString?: string;
  context: Partial<ToolContext>;
}

/**
 * Parse a MIDI clip's note edits, in the meter this update leaves it in, before
 * its first write, so one that can't be read leaves the clip untouched. Every
 * string sent must parse: whether any notes will be left to transform isn't
 * known yet.
 * @param edits - The clip's note edits
 * @param edits.notationString - New notes to merge, if sent
 * @param edits.transformString - Transforms applied after the merge, if sent
 * @param edits.preTransformString - Transforms applied before the merge, if sent
 * @param edits.context - Per-request context, for the notation in use
 * @param timeSigNumerator - The clip's meter numerator after this update
 * @param timeSigDenominator - The clip's meter denominator after this update
 */
export function parseNoteEdits(
  { notationString, transformString, preTransformString, context }: NoteEdits,
  timeSigNumerator: number,
  timeSigDenominator: number,
): void {
  if (notationString != null) {
    parseNotation(notationString, {
      notation: context.notation,
      timeSigNumerator,
      timeSigDenominator,
    });
  }

  for (const transforms of [preTransformString, transformString]) {
    if (transforms) {
      tryParseTransform(transforms, timeSigDenominator, timeSigNumerator);
    }
  }
}

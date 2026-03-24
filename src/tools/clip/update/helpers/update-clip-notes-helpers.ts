// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { formatNotation } from "#src/notation/barbeat/barbeat-format-notation.ts";
import { interpretNotation } from "#src/notation/barbeat/interpreter/barbeat-interpreter.ts";
import { type ClipContext } from "#src/notation/transform/helpers/transform-evaluator-helpers.ts";
import { applyTransforms } from "#src/notation/transform/transform-evaluator.ts";
import { type NoteUpdateResult } from "#src/tools/clip/helpers/clip-result-helpers.ts";
import { MAX_CLIP_BEATS } from "#src/tools/constants.ts";
import { getPlayableNoteCount } from "#src/tools/shared/clip-notes.ts";
import { applyTransformsToExistingNotes } from "./update-clip-transform-helpers.ts";

/**
 * Handle note updates (merge or replace)
 * @param clip - The clip to update
 * @param notationString - The notation string to apply
 * @param transformString - Transform expressions to apply to notes
 * @param noteUpdateMode - 'merge' or 'replace'
 * @param timeSigNumerator - Time signature numerator
 * @param timeSigDenominator - Time signature denominator
 * @param clipContext - Clip-level context for transform variables
 * @returns Note update result, or null if notes not modified
 */
export function handleNoteUpdates(
  clip: LiveAPI,
  notationString: string | undefined,
  transformString: string | undefined,
  noteUpdateMode: string,
  timeSigNumerator: number,
  timeSigDenominator: number,
  clipContext: ClipContext,
): NoteUpdateResult | null {
  // Only skip if BOTH are null
  if (notationString == null && transformString == null) {
    return null;
  }

  // Handle transforms-only case (no notes parameter provided)
  if (notationString == null) {
    // transformString must be defined here (we returned above if both are null)
    return applyTransformsToExistingNotes(
      clip,
      transformString as string,
      timeSigNumerator,
      timeSigDenominator,
      clipContext,
    );
  }

  let combinedNotationString = notationString;

  if (noteUpdateMode === "merge") {
    // In merge mode, prepend existing notes as bar|beat notation
    const existingNotesResult = JSON.parse(
      clip.call("get_notes_extended", 0, 128, 0, MAX_CLIP_BEATS) as string,
    );
    const existingNotes = existingNotesResult?.notes ?? [];

    if (existingNotes.length > 0) {
      const existingNotationString = formatNotation(existingNotes, {
        timeSigNumerator,
        timeSigDenominator,
      });

      combinedNotationString = `${existingNotationString} ${notationString}`;
    }
  }

  const notes = interpretNotation(combinedNotationString, {
    timeSigNumerator,
    timeSigDenominator,
  });

  // Apply transforms to notes if provided
  const transformed = applyTransforms(
    notes,
    transformString,
    timeSigNumerator,
    timeSigDenominator,
    clipContext,
  );

  // Remove all notes and add new notes
  clip.call("remove_notes_extended", 0, 128, 0, MAX_CLIP_BEATS);

  if (notes.length > 0) {
    clip.call("add_new_notes", { notes });
  }

  return { noteCount: getPlayableNoteCount(clip), transformed };
}

// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { formatNotation } from "#src/notation/barbeat/barbeat-format-notation.ts";
import { interpretNotation } from "#src/notation/barbeat/interpreter/barbeat-interpreter.ts";
import { type ClipContext } from "#src/notation/transform/helpers/transform-evaluator-helpers.ts";
import { applyTransforms } from "#src/notation/transform/transform-evaluator.ts";
import { type NoteEvent } from "#src/notation/types.ts";
import { noteNameToMidi } from "#src/shared/pitch.ts";
import * as console from "#src/shared/v8-max-console.ts";
import { type NoteUpdateResult } from "#src/tools/clip/helpers/clip-result-helpers.ts";
import { MAX_CLIP_BEATS } from "#src/tools/constants.ts";
import {
  getPlayableNoteCount,
  rawNotesToNoteEvents,
} from "#src/tools/shared/clip-notes.ts";
import { applyTransformsToExistingNotes } from "./update-clip-transform-helpers.ts";

/**
 * Quantization grid values mapping user-friendly strings to Live API integers
 */
export const QUANTIZE_GRID: Record<string, number> = {
  "1/4": 1,
  "1/8": 2,
  "1/8T": 3,
  "1/8+1/8T": 4,
  "1/16": 5,
  "1/16T": 6,
  "1/16+1/16T": 7,
  "1/32": 8,
};

interface QuantizationOptions {
  /** Quantization strength 0-1 */
  quantize?: number;
  /** Note grid value */
  quantizeGrid?: string;
  /** Limit to specific pitch as note name, e.g., C3, D#4 (optional) */
  quantizePitch?: string;
}

/**
 * Handle note updates: overlay new notes onto existing notes (v0 deletes).
 * @param clip - The clip to update
 * @param notationString - The notation string to apply
 * @param transformString - Transform expressions to apply AFTER merge
 * @param preTransformString - Transform expressions to apply to existing notes BEFORE merge
 * @param timeSigNumerator - Time signature numerator
 * @param timeSigDenominator - Time signature denominator
 * @param clipContext - Clip-level context for transform variables
 * @returns Note update result, or null if notes not modified
 */
export function handleNoteUpdates(
  clip: LiveAPI,
  notationString: string | undefined,
  transformString: string | undefined,
  preTransformString: string | undefined,
  timeSigNumerator: number,
  timeSigDenominator: number,
  clipContext: ClipContext,
): NoteUpdateResult | null {
  // Skip if nothing meaningful to do
  if (
    notationString == null &&
    transformString == null &&
    preTransformString == null
  ) {
    return null;
  }

  // No new notes to merge: apply preTransforms then transforms directly to the
  // existing notes. This is how a clip's notes are cleared/edited without
  // rewriting them — e.g. bare preTransforms "v0" clears everything.
  if (notationString == null) {
    return applyTransformsToExistingNotes(
      clip,
      preTransformString,
      transformString,
      timeSigNumerator,
      timeSigDenominator,
      clipContext,
    );
  }

  // Overlay new notes onto existing ones: prepend existing notes (with any
  // preTransforms applied) as bar|beat notation, so v0 in the new notation can
  // delete overlapping existing notes during interpretation.
  let combinedNotationString = notationString;
  const existingNotesResult = JSON.parse(
    clip.call("get_notes_extended", 0, 128, 0, MAX_CLIP_BEATS) as string,
  );
  const rawExistingNotes = (existingNotesResult?.notes ?? []) as Record<
    string,
    unknown
  >[];
  const existingNotes = applyPreTransformsToExisting(
    rawNotesToNoteEvents(rawExistingNotes),
    preTransformString,
    timeSigNumerator,
    timeSigDenominator,
    clipContext,
  );

  if (existingNotes.length > 0) {
    const existingNotationString = formatNotation(existingNotes, {
      timeSigNumerator,
      timeSigDenominator,
    });

    combinedNotationString = `${existingNotationString} ${notationString}`;
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

/**
 * Apply preTransforms to existing notes in-place (mutates and filters v=0/d=0).
 * Returns the surviving notes; no-ops when preTransformString is missing.
 * @param existingNotes - Existing notes as NoteEvents
 * @param preTransformString - Transform expressions, or undefined to skip
 * @param timeSigNumerator - Time signature numerator
 * @param timeSigDenominator - Time signature denominator
 * @param clipContext - Clip-level context for transform variables
 * @returns The (possibly filtered) existing notes
 */
function applyPreTransformsToExisting(
  existingNotes: NoteEvent[],
  preTransformString: string | undefined,
  timeSigNumerator: number,
  timeSigDenominator: number,
  clipContext: ClipContext,
): NoteEvent[] {
  if (preTransformString == null || existingNotes.length === 0) {
    return existingNotes;
  }

  applyTransforms(
    existingNotes,
    preTransformString,
    timeSigNumerator,
    timeSigDenominator,
    clipContext,
  );

  return existingNotes;
}

/**
 * Handle quantization for MIDI clips
 * @param clip - The clip to quantize
 * @param options - Quantization options
 * @param options.quantize - Quantization strength 0-1
 * @param options.quantizeGrid - Note grid value
 * @param options.quantizePitch - Limit to specific pitch (optional)
 */
export function handleQuantization(
  clip: LiveAPI,
  { quantize, quantizeGrid, quantizePitch }: QuantizationOptions,
): void {
  if (quantize == null) {
    return;
  }

  // Warn and skip for audio clips
  if ((clip.getProperty("is_midi_clip") as number) <= 0) {
    console.warn(`quantize parameter ignored for audio clip (id ${clip.id})`);

    return;
  }

  // Warn and skip if grid not provided
  if (quantizeGrid == null) {
    console.warn("quantize parameter ignored - quantizeGrid is required");

    return;
  }

  const gridValue = QUANTIZE_GRID[quantizeGrid];

  if (quantizePitch != null) {
    const midiPitch = noteNameToMidi(quantizePitch);

    if (midiPitch == null) {
      console.warn(
        `invalid note name "${quantizePitch}" for quantizePitch, ignoring`,
      );

      return;
    }

    clip.call("quantize_pitch", midiPitch, gridValue, quantize);
  } else {
    clip.call("quantize", gridValue, quantize);
  }
}

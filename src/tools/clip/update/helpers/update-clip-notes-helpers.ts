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

/**
 * n/N note-value aliases for quantizeGrid (AJM-481). Each maps to a native grid
 * value that has an exact note-value spelling. The mixed grids (1/8+1/8T,
 * 1/16+1/16T) have no single note-value form, so they stay enum-only.
 */
export const QUANTIZE_GRID_ALIASES: Record<string, string> = {
  "n/4": "1/4",
  "n/8": "1/8",
  "n/12": "1/8T",
  "n/16": "1/16",
  "n/24": "1/16T",
  "n/32": "1/32",
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
  const { notes: existingNotes, matchCount: preTransformCount } =
    applyPreTransformsToExisting(
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

  // Fall back to the preTransform match count when there's no transforms string,
  // so a notes + preTransforms update still reports a count (not undefined).
  return {
    noteCount: getPlayableNoteCount(clip),
    transformed: transformed ?? preTransformCount,
  };
}

/**
 * Apply preTransforms to existing notes in-place (mutates and filters v=0/d=0).
 * Returns the surviving notes plus the preTransform match count (undefined when
 * no preTransformString); no-ops when preTransformString is missing.
 * @param existingNotes - Existing notes as NoteEvents
 * @param preTransformString - Transform expressions, or undefined to skip
 * @param timeSigNumerator - Time signature numerator
 * @param timeSigDenominator - Time signature denominator
 * @param clipContext - Clip-level context for transform variables
 * @returns The (possibly filtered) existing notes and the match count
 */
function applyPreTransformsToExisting(
  existingNotes: NoteEvent[],
  preTransformString: string | undefined,
  timeSigNumerator: number,
  timeSigDenominator: number,
  clipContext: ClipContext,
): { notes: NoteEvent[]; matchCount: number | undefined } {
  if (preTransformString == null || existingNotes.length === 0) {
    return { notes: existingNotes, matchCount: undefined };
  }

  const matchCount = applyTransforms(
    existingNotes,
    preTransformString,
    timeSigNumerator,
    timeSigDenominator,
    clipContext,
  );

  return { notes: existingNotes, matchCount };
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

  // Bridge n/N note-value aliases to their native grid form before lookup
  const grid = QUANTIZE_GRID_ALIASES[quantizeGrid] ?? quantizeGrid;
  const gridValue = QUANTIZE_GRID[grid];

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

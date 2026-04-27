// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { formatNotation } from "#src/notation/barbeat/barbeat-format-notation.ts";
import { interpretNotation } from "#src/notation/barbeat/interpreter/barbeat-interpreter.ts";
import { type ClipContext } from "#src/notation/transform/helpers/transform-evaluator-helpers.ts";
import { applyTransforms } from "#src/notation/transform/transform-evaluator.ts";
import { noteNameToMidi } from "#src/shared/pitch.ts";
import * as console from "#src/shared/v8-max-console.ts";
import { type NoteUpdateResult } from "#src/tools/clip/helpers/clip-result-helpers.ts";
import { MAX_CLIP_BEATS } from "#src/tools/constants.ts";
import { getPlayableNoteCount } from "#src/tools/shared/clip-notes.ts";
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

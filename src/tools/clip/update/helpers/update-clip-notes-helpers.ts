// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import {
  formatNotation,
  interpretNotation,
  resolveNotation,
} from "#src/notation/notation.ts";
import { dedupeNotesKeepingLast, sortNotes } from "#src/notation/note-sort.ts";
import { type ClipContext } from "#src/notation/transform/helpers/transform-evaluator-helpers.ts";
import { applyTransforms } from "#src/notation/transform/transform-evaluator.ts";
import { type NoteEvent } from "#src/notation/types.ts";
import { type Notation } from "#src/shared/notation.ts";
import { noteNameToMidi } from "#src/shared/pitch.ts";
import * as console from "#src/shared/max/v8-max-console.ts";
import { type NoteUpdateResult } from "#src/tools/clip/helpers/clip-result-helpers.ts";
import {
  getClipNoteCount,
  rawNotesToNoteEvents,
  readAllClipNotes,
  removeAllClipNotes,
} from "#src/tools/shared/clip-notes.ts";
import {
  applyTransformsToExistingNotes,
  buildClipContext,
} from "./update-clip-transform-helpers.ts";

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
 * n/N note-value aliases for quantizeGrid. Each maps to a native grid
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
 * @param notation - Global notation setting the notes string is written in (default barbeat)
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
  notation: Notation | undefined,
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

  // Read the full [-length, 2*length] window (matches read-clip) so a pickup
  // before the clip start is carried into the merge — not dropped because it
  // sits outside the playable region [0, length].
  const rawExistingNotes = readAllClipNotes(clip);
  const { notes: existingNotes, matchCount: preTransformCount } =
    applyPreTransformsToExisting(
      rawNotesToNoteEvents(rawExistingNotes),
      preTransformString,
      timeSigNumerator,
      timeSigDenominator,
      clipContext,
    );

  const notes = mergeNewNotes(
    notation,
    notationString,
    existingNotes,
    timeSigNumerator,
    timeSigDenominator,
  );

  // Apply transforms to notes if provided
  const transformed = applyTransforms(
    notes,
    transformString,
    timeSigNumerator,
    timeSigDenominator,
    clipContext,
  );

  // Remove all notes and add new notes. Dedupe same-pitch+start collisions
  // (new wins — new notes follow the existing ones in the combined array) then
  // sort ascending by start_time so Live resolves every same-pitch overlap by
  // truncation instead of deleting the earlier write. See note-sort.ts.
  removeAllClipNotes(clip);

  const mergedNotes = sortNotes(dedupeNotesKeepingLast(notes));

  if (mergedNotes.length > 0) {
    clip.call("add_new_notes", { notes: mergedNotes });
  }

  // Fall back to the preTransform match count when there's no transforms string,
  // so a notes + preTransforms update still reports a count (not undefined).
  return {
    noteCount: getClipNoteCount(clip),
    transformed: transformed ?? preTransformCount,
  };
}

/**
 * Build the merged note array (existing + new) ready for the dedupe/sort/write
 * tail. The merge strategy differs by notation:
 * - barbeat: prepend the existing notes (preTransforms already applied) as
 *   bar|beat notation and re-interpret the combined string, so `v0` in the new
 *   notation can delete overlapping existing notes during interpretation.
 * - midi-json / stark: these have no lossless text serializer for the existing
 *   notes, so combine the NoteEvent arrays directly (new notes last, so they win
 *   same-pitch+start collisions in dedupeNotesKeepingLast). There is no
 *   `v0`-delete convention — use preTransforms to delete or edit existing notes.
 * @param notation - Global notation setting the new notes string is written in (or undefined)
 * @param notationString - The new notes
 * @param existingNotes - Existing notes (preTransforms already applied)
 * @param timeSigNumerator - Time signature numerator
 * @param timeSigDenominator - Time signature denominator
 * @returns Combined note array (unsorted, not yet deduped)
 */
function mergeNewNotes(
  notation: Notation | undefined,
  notationString: string,
  existingNotes: NoteEvent[],
  timeSigNumerator: number,
  timeSigDenominator: number,
): NoteEvent[] {
  // Only bar|beat round-trips through text (so `v0` in the new notes can delete
  // overlapping existing notes). midi-json and stark lack a serializer for the
  // existing notes, so they merge NoteEvent arrays directly.
  if (resolveNotation(notation) !== "barbeat") {
    const newNotes = interpretNotation(notationString, {
      notation,
      timeSigNumerator,
      timeSigDenominator,
    });

    return [...existingNotes, ...newNotes];
  }

  let combinedNotationString = notationString;

  if (existingNotes.length > 0) {
    const existingNotationString = formatNotation(existingNotes, {
      timeSigNumerator,
      timeSigDenominator,
    });

    combinedNotationString = `${existingNotationString} ${notationString}`;
  }

  return interpretNotation(combinedNotationString, {
    timeSigNumerator,
    timeSigDenominator,
  });
}

/**
 * Double the clip's loop via Live's native Clip.duplicate_loop. Live extends the
 * loop (looped clips move loop_end; unlooped clips duplicate the start/end range)
 * and copies the existing notes AND automation envelopes into the new half - the
 * envelope copy is something the manual length+notes path can't do. MIDI clips
 * only: audio clips warn-and-skip so a mixed comma-separated batch keeps going.
 * @param clip - The clip to double
 * @returns Note update result with the post-duplicate note count, or null when
 *   skipped (audio clip)
 */
export function handleDuplicateLoop(clip: LiveAPI): NoteUpdateResult | null {
  if ((clip.getProperty("is_midi_clip") as number) <= 0) {
    console.warn(
      `duplicateLoop parameter ignored for audio clip (id ${clip.id})`,
    );

    return null;
  }

  clip.call("duplicate_loop");

  // duplicate_loop mutates the clip in place (same id). Recreate from id to dodge
  // LiveAPI staleness - matters for arrangement clips - before reading the count.
  const freshClip = LiveAPI.from(clip.id);

  return { noteCount: getClipNoteCount(freshClip) };
}

/**
 * MIDI duplicateLoop pipeline: edits compose with the native double on a defined
 * timeline. (1) Flush preTransforms onto the existing notes first, so Live's copy
 * carries the edited source into the new half. (2) Double the loop. (3) Merge new
 * notes and apply transforms across the full doubled clip. The clip is re-read
 * from its id and its context rebuilt after the double so transform variables
 * (bar.*, clip.*) see the doubled length. Caller guarantees a MIDI clip.
 * @param params - The clip plus the edit strings and per-clip context indices
 * @param params.clip - The MIDI clip to double and edit
 * @param params.notationString - New notes to merge after the double, or undefined
 * @param params.transformString - Transforms to apply after the double, or undefined
 * @param params.preTransformString - Transforms to apply before the double, or undefined
 * @param params.timeSigNumerator - Time signature numerator
 * @param params.timeSigDenominator - Time signature denominator
 * @param params.clipIndex - 0-based index in the multi-clip batch
 * @param params.clipCount - Total clips in the batch
 * @param params.notation - Global notation setting the notes string is written in (or undefined)
 * @returns Note update result with the final post-edit note count
 */
export function handleDuplicateLoopWithEdits({
  clip,
  notationString,
  transformString,
  preTransformString,
  timeSigNumerator,
  timeSigDenominator,
  clipIndex,
  clipCount,
  notation,
}: {
  clip: LiveAPI;
  notationString: string | undefined;
  transformString: string | undefined;
  preTransformString: string | undefined;
  timeSigNumerator: number;
  timeSigDenominator: number;
  clipIndex: number;
  clipCount: number;
  notation: Notation | undefined;
}): NoteUpdateResult | null {
  // Stage 1: flush preTransforms onto the existing notes before doubling.
  if (preTransformString != null) {
    const preContext = buildClipContext(
      clip,
      clipIndex,
      clipCount,
      timeSigNumerator,
      timeSigDenominator,
    );

    applyTransformsToExistingNotes(
      clip,
      preTransformString,
      undefined,
      timeSigNumerator,
      timeSigDenominator,
      preContext,
    );
  }

  // Stage 2: native double (MIDI guaranteed by the caller).
  const dupResult = handleDuplicateLoop(clip);

  // Stage 3: merge notes + transforms across the doubled clip. Re-read from id
  // (duplicate_loop mutates in place) and rebuild context for the doubled length.
  if (notationString == null && transformString == null) {
    return dupResult;
  }

  const freshClip = LiveAPI.from(clip.id);
  const postContext = buildClipContext(
    freshClip,
    clipIndex,
    clipCount,
    timeSigNumerator,
    timeSigDenominator,
  );
  const mergeResult = handleNoteUpdates(
    freshClip,
    notationString,
    transformString,
    undefined,
    timeSigNumerator,
    timeSigDenominator,
    postContext,
    notation,
  );

  return mergeResult ?? dupResult;
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
 * @param options.quantizeGrid - Note grid value (defaults to 1/16)
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

  // Default to 1/16 when no grid given: the finest common grid, so it moves
  // notes the least (safest when the model didn't specify one).
  const requestedGrid = quantizeGrid ?? "1/16";

  // Bridge n/N note-value aliases to their native grid form before lookup
  const grid = QUANTIZE_GRID_ALIASES[requestedGrid] ?? requestedGrid;
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

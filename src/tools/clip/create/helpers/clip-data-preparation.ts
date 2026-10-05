// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { interpretNotation } from "#src/notation/notation.ts";
import { dedupeAndSortNotes, sortNotes } from "#src/notation/note-sort.ts";
import { type Notation } from "#src/shared/notation.ts";
import { type MidiNote } from "#src/tools/clip/helpers/clip-results.ts";
import { calculateClipLength } from "./create-clip-validation.ts";

interface PreparedClipData {
  notes: MidiNote[];
  clipLength: number;
  /** Duplicates dropped from the notes; 0 when a transform will run first */
  droppedDuplicates: number;
}

/**
 * Prepares clip data (notes and initial length) based on clip type.
 * Notation is interpreted once here; transforms run per clip, once its target is named, so
 * clip.index/clip.count/clipseq() vary across a multi-clip create.
 * @param sampleFile - Audio file path (if audio clip)
 * @param notationString - MIDI notation string (if MIDI clip)
 * @param endBeats - End position in beats
 * @param timeSigNumerator - Time signature numerator
 * @param timeSigDenominator - Time signature denominator
 * @param notation - Global notation setting the notes string is written in (default barbeat)
 * @param transformString - Transform expressions (if any), or null
 * @returns Object with notes array, clipLength and the duplicates dropped
 */
export function prepareClipData(
  sampleFile: string | null,
  notationString: string | null,
  endBeats: number | null,
  timeSigNumerator: number,
  timeSigDenominator: number,
  notation: Notation | undefined,
  transformString: string | null,
): PreparedClipData {
  // Parse notation into notes (MIDI clips only)
  const interpretedNotes: MidiNote[] =
    notationString != null
      ? interpretNotation(notationString, {
          notation,
          timeSigNumerator,
          timeSigDenominator,
        })
      : [];

  // Order the shared notes ascending by start_time for the eventual
  // add_new_notes write. Same-pitch+start collisions are dropped (keep-last)
  // only when no transform will run: a timing transform can pull two colliding
  // onsets apart, so dropping them up front would lose notes update-clip keeps.
  // With a transform, the per-clip transform re-dedupes AFTER transforming
  // (resolveClipTransform), matching update-clip's transform-then-dedupe order.
  const { notes, collisions } =
    transformString != null
      ? { notes: sortNotes(interpretedNotes), collisions: 0 }
      : dedupeAndSortNotes(interpretedNotes);

  // Determine clip length
  let clipLength: number;

  if (sampleFile) {
    // Audio clips get length from the sample file, not this value
    clipLength = 1;
  } else {
    // MIDI clips: calculate based on notes and parameters
    clipLength = calculateClipLength(
      endBeats,
      notes,
      timeSigNumerator,
      timeSigDenominator,
    );
  }

  return { notes, clipLength, droppedDuplicates: collisions };
}

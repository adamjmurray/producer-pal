// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { interpretNotation } from "#src/notation/notation.ts";
import { dedupeAndSortNotes, sortNotes } from "#src/notation/note-sort.ts";
import { type Notation } from "#src/shared/notation.ts";
import * as console from "#src/shared/max/v8-max-console.ts";
import { type MidiNote } from "#src/tools/clip/helpers/clip-results.ts";
import { calculateClipLength } from "./create-clip-validation.ts";

interface PreparedClipData {
  notes: MidiNote[];
  clipLength: number;
}

/**
 * Prepares clip data (notes and initial length) based on clip type.
 * Notation is interpreted once here; transforms run per clip in createClips so
 * clip.index/clip.count/clipseq() vary across a multi-clip create.
 * @param sampleFile - Audio file path (if audio clip)
 * @param notationString - MIDI notation string (if MIDI clip)
 * @param endBeats - End position in beats
 * @param timeSigNumerator - Time signature numerator
 * @param timeSigDenominator - Time signature denominator
 * @param notation - Global notation setting the notes string is written in (default barbeat)
 * @param transformString - Transform expressions (if any), or null
 * @returns Object with notes array and clipLength
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
  // add_new_notes write. Same-pitch+start collisions are dropped (keep-last) and
  // warned ONLY when no transform will run: a timing transform can pull two
  // colliding onsets apart, so dropping them up front would lose notes
  // update-clip keeps. With a transform, keep the duplicates here and let the
  // per-clip transform re-dedupe AFTER transforming (resolveClipTransform),
  // matching update-clip's transform-then-dedupe order.
  const notes =
    transformString != null
      ? sortNotes(interpretedNotes)
      : dropDuplicateNotes(interpretedNotes);

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

  return { notes, clipLength };
}

/**
 * Drop same-pitch+start collisions (keep-last), sort ascending by start_time,
 * and warn how many were dropped so the LLM sees it. Used on the no-transform
 * create path; the transform path defers deduping until after transforming.
 * @param interpretedNotes - Notes as interpreted from the notation
 * @returns The deduped, sorted notes
 */
function dropDuplicateNotes(interpretedNotes: MidiNote[]): MidiNote[] {
  const { notes, collisions } = dedupeAndSortNotes(interpretedNotes);

  if (collisions > 0) {
    console.warn(
      `Dropped ${collisions} duplicate note${collisions === 1 ? "" : "s"} at the same pitch and start`,
    );
  }

  return notes;
}

// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { sortNotes } from "#src/notation/note-sort.ts";
import { type ClipContext } from "#src/notation/transform/helpers/transform-evaluator-helpers.ts";
import { applyTransforms } from "#src/notation/transform/transform-evaluator.ts";
import { type NoteEvent } from "#src/notation/types.ts";
import {
  CHROMATIC_SCALE_MASK,
  scaleIntervalsToPitchClassMask,
} from "#src/shared/pitch.ts";
import * as console from "#src/shared/v8-max-console.ts";
import { type NoteUpdateResult } from "#src/tools/clip/helpers/clip-result-helpers.ts";
import { MAX_CLIP_BEATS } from "#src/tools/constants.ts";
import {
  getPlayableNoteCount,
  rawNotesToNoteEvents,
} from "#src/tools/shared/clip-notes.ts";

/**
 * Apply transforms to existing notes without merging new notes.
 * Used when the notes param is omitted: preTransforms and/or transforms mutate
 * the clip's existing notes in place. With no merge between them, preTransforms
 * simply runs as the first pass and transforms as the second — the same ordering
 * as the merge path, so preTransforms fully resolves (including v0 deletions)
 * before transforms runs. Either string may be omitted; bare `preTransforms: "v0"`
 * is how you clear a clip without rewriting it.
 * @param clip - The clip to update
 * @param preTransformString - Transform expressions to apply first, or undefined
 * @param transformString - Transform expressions to apply second, or undefined
 * @param timeSigNumerator - Time signature numerator
 * @param timeSigDenominator - Time signature denominator
 * @param clipContext - Clip-level context for transform variables
 * @returns Note update result with count and transformed
 */
export function applyTransformsToExistingNotes(
  clip: LiveAPI,
  preTransformString: string | undefined,
  transformString: string | undefined,
  timeSigNumerator: number,
  timeSigDenominator: number,
  clipContext?: ClipContext,
): NoteUpdateResult {
  const existingNotesResult = JSON.parse(
    clip.call("get_notes_extended", 0, 128, 0, MAX_CLIP_BEATS) as string,
  );
  const rawNotes = (existingNotesResult?.notes ?? []) as Record<
    string,
    unknown
  >[];

  if (rawNotes.length === 0) {
    console.warn("transforms ignored: clip has no notes to transform");

    return { noteCount: 0 };
  }

  // Convert raw notes to NoteEvent format (strips extra Live API properties)
  const notes: NoteEvent[] = rawNotesToNoteEvents(rawNotes);

  // applyTransforms mutates notes in place (and no-ops on an undefined string).
  const preCount = applyTransforms(
    notes,
    preTransformString,
    timeSigNumerator,
    timeSigDenominator,
    clipContext,
  );
  const postCount = applyTransforms(
    notes,
    transformString,
    timeSigNumerator,
    timeSigDenominator,
    clipContext,
  );

  clip.call("remove_notes_extended", 0, 128, 0, MAX_CLIP_BEATS);

  if (notes.length > 0) {
    // Sort ascending by start_time before re-adding: a transform can shift a
    // note onto an earlier same-pitch note's onset, which Live resolves by
    // deleting the earlier note unless the write order is ascending. The merge
    // path is already sorted (via formatNotation); this keeps parity.
    clip.call("add_new_notes", { notes: sortNotes(notes) });
  }

  return {
    noteCount: getPlayableNoteCount(clip),
    transformed: postCount ?? preCount,
  };
}

/**
 * Build clip context for transform variables (clip.*)
 * @param clip - The clip LiveAPI object
 * @param clipIndex - 0-based index in multi-clip operation
 * @param clipCount - Total number of clips in the operation
 * @param timeSigNumerator - Time signature numerator
 * @param timeSigDenominator - Time signature denominator
 * @returns ClipContext with clip-level metadata
 */
export function buildClipContext(
  clip: LiveAPI,
  clipIndex: number,
  clipCount: number,
  timeSigNumerator: number,
  timeSigDenominator: number,
): ClipContext {
  const isArrangementClip =
    (clip.getProperty("is_arrangement_clip") as number) > 0;

  const durationBeats = isArrangementClip
    ? (clip.getProperty("end_time") as number) -
      (clip.getProperty("start_time") as number)
    : (clip.getProperty("length") as number);

  return {
    clipDuration: durationBeats * (timeSigDenominator / 4),
    clipIndex,
    clipCount,
    arrangementStart: isArrangementClip
      ? (clip.getProperty("start_time") as number) * (timeSigDenominator / 4)
      : undefined,
    barDuration: timeSigNumerator,
    timeSigDenominator,
    scalePitchClassMask: readScaleMask(),
  };
}

/**
 * Read the Live Set's global scale and return a pitch class bitmask.
 * Returns undefined if no scale is active or the scale is chromatic (no-op optimization).
 * @returns Pitch class bitmask, or undefined for no-op cases
 */
function readScaleMask(): number | undefined {
  const liveSet = LiveAPI.from("live_set");
  const scaleMode = liveSet.getProperty("scale_mode") as number;

  if (scaleMode === 0) return undefined;

  const rootNote = liveSet.getProperty("root_note") as number;
  const intervals = liveSet.getProperty("scale_intervals") as number[];
  const mask = scaleIntervalsToPitchClassMask(intervals, rootNote);

  return mask === CHROMATIC_SCALE_MASK ? undefined : mask;
}

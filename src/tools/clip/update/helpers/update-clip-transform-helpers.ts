// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { dedupeNotesKeepingLast, sortNotes } from "#src/notation/note-sort.ts";
import { type ClipContext } from "#src/notation/transform/helpers/transform-evaluator-helpers.ts";
import { applyTransforms } from "#src/notation/transform/transform-evaluator.ts";
import { type NoteEvent } from "#src/notation/types.ts";
import * as console from "#src/shared/v8-max-console.ts";
import { type NoteUpdateResult } from "#src/tools/clip/helpers/clip-result-helpers.ts";
import { readLiveSetScaleMask } from "#src/tools/clip/helpers/scale-mask.ts";
import {
  getClipNoteCount,
  rawNotesToNoteEvents,
  readAllClipNotes,
  removeAllClipNotes,
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
  // Read the full [-length, 2*length] window so a pickup note (negative
  // start_time) is transformed too — otherwise `preTransforms: "v0"` reports
  // "no notes to transform" and leaves the pickup orphaned (noteCount lies 0).
  const rawNotes = readAllClipNotes(clip);

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

  removeAllClipNotes(clip);

  if (notes.length > 0) {
    // Dedupe then sort before re-adding, identically to the merge path: a
    // transform can collapse two notes onto the same pitch+exact-onset (dedupe
    // keep-last resolves that deterministically instead of letting Live drop
    // one), and any remaining tail overlap is made safe by ascending order.
    clip.call("add_new_notes", {
      notes: sortNotes(dedupeNotesKeepingLast(notes)),
    });
  }

  return {
    noteCount: getClipNoteCount(clip),
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
    scalePitchClassMask: readLiveSetScaleMask(),
  };
}

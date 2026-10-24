// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { dedupeAndSortNotes } from "#src/notation/note-sort.ts";
import { type ClipContext } from "#src/notation/transform/helpers/transform-context.ts";
import { applyTransforms } from "#src/notation/transform/transform-evaluator.ts";
import {
  countTransforms,
  type TransformCounts,
} from "#src/notation/transform/transformed-count.ts";
import {
  droppedDuplicatesNote,
  transformsIgnoredAudioNote,
  transformsIgnoredNoNotesNote,
} from "#src/tools/clip/helpers/clip-entry-notes.ts";
import { type MidiNote } from "#src/tools/clip/helpers/clip-results.ts";
import { buildTransformClipContext } from "#src/tools/clip/helpers/transform-clip-context.ts";
import { createdClipLength } from "./created-clip-result.ts";
import { calculateClipLength } from "./create-clip-validation.ts";

/** Inputs constant across all clips in one create operation */
export interface ClipTransformInputs {
  /** Shared interpreted notes (untransformed) */
  notes: MidiNote[];
  /** Duplicates already dropped from the shared notes (no-transform path) */
  droppedDuplicates: number;
  /** Provisional clip length in Ableton beats, from the interpreted notes */
  clipLength: number;
  transformString: string | null;
  /** Audio clips have no notes to transform */
  isAudio: boolean;
  endBeats: number | null;
  /** Where the region starts (start marker and loop start), or null for 1|1 */
  startBeats: number | null;
  timeSigNumerator: number;
  timeSigDenominator: number;
  /** Live Set scale mask for the `scale:mask` variable, or undefined */
  scaleMask: number | undefined;
}

export interface ClipTransformResult {
  notes: MidiNote[];
  clipLength: number;
  /** What the transform changed and deleted; empty when none ran */
  transformCounts: TransformCounts;
  /** Facts about this clip for its entry: transform skipped, duplicates dropped */
  details: string[];
}

/**
 * Resolve the notes + clip length for one clip in a multi-clip create.
 * When a transform is present (MIDI only), clone the shared interpreted notes
 * and apply the transform with this clip's context so clipseq()/clip.index/
 * clip.count vary per clip, then recompute the length from the transformed
 * notes. Otherwise reuse the shared notes/length unchanged.
 * @param inputs - Inputs constant across the create operation
 * @param clipIndex - 0-based index of this clip within the view
 * @param clipCount - Total clips created in this view
 * @param arrangementStartBeats - Arrangement start in Ableton beats, or null for session
 * @returns Notes, clip length, transform counts, and what to say on the clip's
 *   entry
 */
export function resolveClipTransform(
  inputs: ClipTransformInputs,
  clipIndex: number,
  clipCount: number,
  arrangementStartBeats: number | null,
): ClipTransformResult {
  const { notes, clipLength, transformString, isAudio } = inputs;

  if (transformString == null) {
    return {
      notes,
      clipLength,
      transformCounts: {},
      details: factsFor(droppedDuplicatesNote(inputs.droppedDuplicates)),
    };
  }

  // Nothing to transform: the clip is made as asked, and its entry says so
  if (isAudio || notes.length === 0) {
    return {
      notes,
      clipLength,
      transformCounts: {},
      details: [
        isAudio
          ? transformsIgnoredAudioNote()
          : transformsIgnoredNoNotesNote(["transforms"]),
      ],
    };
  }

  // Clone so each clip transforms an independent copy (notes are flat objects)
  const clipNotes: MidiNote[] = notes.map((n) => ({ ...n }));
  const clipContext = buildCreateClipContext(
    inputs,
    clipIndex,
    clipCount,
    arrangementStartBeats,
  );

  const outcome = applyTransforms(
    clipNotes,
    transformString,
    inputs.timeSigNumerator,
    inputs.timeSigDenominator,
    clipContext,
  );

  // Dedupe then sort ascending by start_time: a transform (e.g. repeat) can land
  // a note on an existing same-pitch+exact-onset note, which Live's add_new_notes
  // deletes nondeterministically — dedupe collapses those to one (keeping last).
  // Sorting then guards the remaining earlier-onset shifts (ascending writes
  // survive). Mirrors the update and merge write paths.
  const { notes: sorted, collisions } = dedupeAndSortNotes(clipNotes);

  return {
    notes: sorted,
    clipLength: calculateClipLength(
      inputs.endBeats,
      sorted,
      inputs.timeSigNumerator,
      inputs.timeSigDenominator,
    ),
    // Counted on the deduped notes, so collapsed duplicates don't inflate it.
    transformCounts: countTransforms(outcome, sorted),
    details: factsFor(droppedDuplicatesNote(collisions)),
  };
}

/**
 * @param note - A note for the entry, or null
 * @returns The note as a list of zero or one
 */
function factsFor(note: string | null): string[] {
  return note == null ? [] : [note];
}

/**
 * Build the clip-level context for a not-yet-created clip from known params.
 * @param inputs - Inputs constant across the create operation
 * @param clipIndex - 0-based index of this clip within the view
 * @param clipCount - Total clips created in this view
 * @param arrangementStartBeats - Arrangement start in Ableton beats, or null for session
 * @returns ClipContext for transform variable evaluation
 */
function buildCreateClipContext(
  inputs: ClipTransformInputs,
  clipIndex: number,
  clipCount: number,
  arrangementStartBeats: number | null,
): ClipContext {
  // clipLength runs from beat 0 to the region's end, so it is note time.
  return buildTransformClipContext({
    regionLengthBeats: createdClipLength(inputs.clipLength, inputs.startBeats),
    clipIndex,
    clipCount,
    arrangementStartBeats: arrangementStartBeats ?? undefined,
    startMarkerBeats: inputs.startBeats ?? 0,
    clipEndBeats: inputs.clipLength,
    timeSigNumerator: inputs.timeSigNumerator,
    timeSigDenominator: inputs.timeSigDenominator,
    scalePitchClassMask: inputs.scaleMask,
  });
}

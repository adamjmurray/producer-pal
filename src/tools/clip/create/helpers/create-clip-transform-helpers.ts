// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { sortNotes } from "#src/notation/note-sort.ts";
import { type ClipContext } from "#src/notation/transform/helpers/transform-evaluator-helpers.ts";
import { applyTransforms } from "#src/notation/transform/transform-evaluator.ts";
import { type MidiNote } from "#src/tools/clip/helpers/clip-result-helpers.ts";
import { calculateClipLength } from "./create-clip-validation-helpers.ts";

/** Inputs constant across all clips in one create operation */
export interface ClipTransformInputs {
  /** Shared interpreted notes (untransformed) */
  notes: MidiNote[];
  /** Provisional clip length in Ableton beats, from the interpreted notes */
  clipLength: number;
  transformString: string | null;
  /** Audio clips have no notes to transform */
  isAudio: boolean;
  endBeats: number | null;
  timeSigNumerator: number;
  timeSigDenominator: number;
  /** Live Set scale mask for the `scale:mask` variable, or undefined */
  scaleMask: number | undefined;
}

export interface ClipTransformResult {
  notes: MidiNote[];
  clipLength: number;
  transformedCount: number | undefined;
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
 * @returns Notes, clip length, and transformed-note count for this clip
 */
export function resolveClipTransform(
  inputs: ClipTransformInputs,
  clipIndex: number,
  clipCount: number,
  arrangementStartBeats: number | null,
): ClipTransformResult {
  const { notes, clipLength, transformString, isAudio } = inputs;

  if (transformString == null || isAudio || notes.length === 0) {
    return { notes, clipLength, transformedCount: undefined };
  }

  // Clone so each clip transforms an independent copy (notes are flat objects)
  const clipNotes: MidiNote[] = notes.map((n) => ({ ...n }));
  const clipContext = buildCreateClipContext(
    inputs,
    clipIndex,
    clipCount,
    arrangementStartBeats,
  );

  const transformedCount = applyTransforms(
    clipNotes,
    transformString,
    inputs.timeSigNumerator,
    inputs.timeSigDenominator,
    clipContext,
  );

  // Sort ascending by start_time: a transform can shift a note onto an earlier
  // same-pitch onset, which Live deletes unless the write order is ascending.
  const sorted = sortNotes(clipNotes);

  return {
    notes: sorted,
    clipLength: calculateClipLength(
      inputs.endBeats,
      sorted,
      inputs.timeSigNumerator,
      inputs.timeSigDenominator,
    ),
    transformedCount,
  };
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
  const beatScale = inputs.timeSigDenominator / 4;

  return {
    // The clip doesn't exist yet, so clip.duration reflects the pre-transform
    // note extent (or explicit length) — the best knowable provisional value.
    clipDuration: inputs.clipLength * beatScale,
    clipIndex,
    clipCount,
    arrangementStart:
      arrangementStartBeats != null
        ? arrangementStartBeats * beatScale
        : undefined,
    barDuration: inputs.timeSigNumerator,
    timeSigDenominator: inputs.timeSigDenominator,
    scalePitchClassMask: inputs.scaleMask,
  };
}

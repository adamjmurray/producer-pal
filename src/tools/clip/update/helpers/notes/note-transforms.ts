// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { dedupeAndSortNotes } from "#src/notation/note-sort.ts";
import { type ClipContext } from "#src/notation/transform/helpers/transform-context.ts";
import { applyTransforms } from "#src/notation/transform/transform-evaluator.ts";
import {
  combineOutcomes,
  countTransforms,
} from "#src/notation/transform/transformed-count.ts";
import { type NoteEvent } from "#src/notation/types.ts";
import { clipLengthBeats } from "#src/tools/clip/helpers/audio-clip-timing.ts";
import {
  droppedDuplicatesNote,
  transformsIgnoredNoNotesNote,
} from "#src/tools/clip/helpers/clip-entry-notes.ts";
import { type NoteUpdateResult } from "#src/tools/clip/helpers/clip-results.ts";
import {
  buildTransformClipContext,
  type TransformClipContextInput,
} from "#src/tools/clip/helpers/transform-clip-context.ts";
import {
  readLiveSetScaleMask,
  type ScaleMaskReader,
} from "#src/tools/clip/helpers/scale-mask.ts";
import {
  getClipNoteCount,
  rawNotesToCopiedNotes,
  readClipNotes,
  removeAllClipNotes,
} from "#src/tools/shared/clip/clip-notes.ts";
import { type ClipReasons, noteClipReason } from "../entries/clip-reasons.ts";
import { mutedNotesHit, reportMutedNoteEffects } from "./muted-note-effects.ts";

/**
 * Apply transforms to existing notes without merging new notes.
 * Used when the notes param is omitted: preTransforms and/or transforms mutate
 * the clip's existing notes in place. With no merge between them, preTransforms
 * simply runs as the first pass and transforms as the second — the same ordering
 * as the merge path, so preTransforms fully resolves (including v0 deletions)
 * before transforms runs. Either string may be omitted; bare `preTransforms: "v0"`
 * is how you clear a clip without rewriting it.
 * @param clip - The clip to update
 * @param reasons - What each clip has to say beyond its result, added to
 * @param preTransformString - Transform expressions to apply first, or undefined
 * @param transformString - Transform expressions to apply second, or undefined
 * @param timeSigNumerator - Time signature numerator
 * @param timeSigDenominator - Time signature denominator
 * @param clipContext - Clip-level context for transform variables
 * @returns Note update result with count, transformed and deletedNotes
 */
export function applyTransformsToExistingNotes(
  clip: LiveAPI,
  reasons: ClipReasons,
  preTransformString: string | undefined,
  transformString: string | undefined,
  timeSigNumerator: number,
  timeSigDenominator: number,
  clipContext?: ClipContext,
): NoteUpdateResult {
  // Read the same window as read-clip, so a pickup before the clip start is
  // transformed too — `preTransforms: "v0"` must clear it.
  // Muted notes are absent to the transforms and put back after.
  const { visible, muted } = readClipNotes(clip);

  // A no-op, not a refusal: there was nothing to transform, so the clip is
  // already how the call asked for it and the entry keeps its noteCount.
  if (visible.length === 0) {
    const sent = [
      preTransformString != null ? "preTransforms" : null,
      transformString != null ? "transforms" : null,
    ].filter((param) => param != null);

    noteClipReason(
      reasons,
      clip.id,
      transformsIgnoredNoNotesNote(sent, muted.length > 0),
    );

    return { noteCount: 0 };
  }

  // Copied whole (only note_id goes), so a note the transforms don't change is
  // written back exactly as it was, release velocity included.
  const notes: NoteEvent[] = rawNotesToCopiedNotes(visible);

  // applyTransforms mutates notes in place (and no-ops on an undefined string).
  const preOutcome = applyTransforms(
    notes,
    preTransformString,
    timeSigNumerator,
    timeSigDenominator,
    clipContext,
  );
  const postOutcome = applyTransforms(
    notes,
    transformString,
    timeSigNumerator,
    timeSigDenominator,
    clipContext,
  );

  removeAllClipNotes(clip);

  // Dedupe then sort before re-adding, identically to the merge path: a
  // transform can collapse two notes onto the same pitch+exact-onset (dedupe
  // keep-last resolves that deterministically instead of letting Live drop
  // one), and any remaining tail overlap is made safe by ascending order.
  const mutedNotes = rawNotesToCopiedNotes(muted);
  const { notes: written, collisions } = dedupeAndSortNotes(notes, mutedNotes);

  if (written.length > 0) {
    clip.call("add_new_notes", { notes: written });
  }

  noteDroppedDuplicates(reasons, clip.id, collisions);

  // No visible note shared a slot with a muted one before, so every muted note
  // a transform landed on was replaced by it.
  reportMutedNoteEffects(clip, reasons, {
    written,
    muted: mutedNotes,
    replaced: mutedNotesHit(notes, mutedNotes).size,
  });

  return {
    noteCount: getClipNoteCount(clip),
    ...countTransforms(combineOutcomes(preOutcome, postOutcome), written),
  };
}

/**
 * Say on the clip's entry that a transform collapsed notes onto one another.
 * @param reasons - What each clip has to say beyond its result, added to
 * @param clipId - The clip
 * @param count - How many notes were dropped
 */
export function noteDroppedDuplicates(
  reasons: ClipReasons,
  clipId: string,
  count: number,
): void {
  const note = droppedDuplicatesNote(count);

  if (note != null && !reasons.said.get(clipId)?.includes(note)) {
    noteClipReason(reasons, clipId, note);
  }
}

/**
 * Build clip context for transform variables (clip.*)
 * @param clip - The clip LiveAPI object
 * @param clipIndex - 0-based index in multi-clip operation
 * @param clipCount - Total number of clips in the operation
 * @param timeSigNumerator - Time signature numerator
 * @param timeSigDenominator - Time signature denominator
 * @param readScaleMask - Reads the scale mask; pass a reader shared across the
 *   call so a batch asks Live once
 * @returns ClipContext with clip-level metadata
 */
export function buildClipContext(
  clip: LiveAPI,
  clipIndex: number,
  clipCount: number,
  timeSigNumerator: number,
  timeSigDenominator: number,
  readScaleMask: ScaleMaskReader = readLiveSetScaleMask,
): ClipContext {
  const isArrangementClip =
    (clip.getProperty("is_arrangement_clip") as number) > 0;
  const startTime = clip.getProperty("start_time") as number;

  return buildTransformClipContext({
    regionLengthBeats: isArrangementClip
      ? (clip.getProperty("end_time") as number) - startTime
      : clipLengthBeats(clip),
    clipIndex,
    clipCount,
    arrangementStartBeats: isArrangementClip ? startTime : undefined,
    ...noteTimeRegion(clip),
    timeSigNumerator,
    timeSigDenominator,
    scalePitchClassMask: readScaleMask(),
  });
}

/**
 * Where a MIDI clip's playback starts and stops, in note time. Audio clips
 * have no notes, and an unwarped one's markers are in seconds, so they get
 * neither.
 * @param clip - The clip LiveAPI object
 * @returns startMarkerBeats and clipEndBeats in Ableton beats, or {} for audio
 */
function noteTimeRegion(
  clip: LiveAPI,
): Pick<TransformClipContextInput, "startMarkerBeats" | "clipEndBeats"> {
  if ((clip.getProperty("is_midi_clip") as number) === 0) {
    return { startMarkerBeats: undefined, clipEndBeats: undefined };
  }

  const looping = (clip.getProperty("looping") as number) > 0;

  return {
    startMarkerBeats: clip.getProperty("start_marker") as number,
    clipEndBeats: clip.getProperty(
      looping ? "loop_end" : "end_marker",
    ) as number,
  };
}

/**
 * Whether the update edits the clip's notes: any of notes, transforms, or
 * preTransforms. These are also the only reason to build the clip context, and
 * building it reads the Live Set's scale — so a batch that only renames clips
 * skips that read instead of paying it once per clip.
 * @param notationString - New notes to merge, or undefined
 * @param transformString - Transforms applied after the merge, or undefined
 * @param preTransformString - Transforms applied before the merge, or undefined
 * @returns True when any of the three names something
 */
export function hasNoteEdits(
  notationString: string | undefined,
  transformString: string | undefined,
  preTransformString: string | undefined,
): boolean {
  return (
    notationString != null ||
    transformString != null ||
    preTransformString != null
  );
}

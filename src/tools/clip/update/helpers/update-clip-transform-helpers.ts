// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: GPL-3.0-or-later

import { type ClipContext } from "#src/notation/transform/transform-evaluator-helpers.ts";
import { applyTransforms } from "#src/notation/transform/transform-evaluator.ts";
import { type NoteEvent } from "#src/notation/types.ts";
import {
  CHROMATIC_SCALE_MASK,
  scaleIntervalsToPitchClassMask,
} from "#src/shared/pitch.ts";
import * as console from "#src/shared/v8-max-console.ts";
import { MAX_CLIP_BEATS } from "#src/tools/constants.ts";
import { getPlayableNoteCount } from "#src/tools/shared/clip-notes.ts";

/**
 * Convert a raw note from the Live API to a NoteEvent for add_new_notes.
 * The Live API returns extra properties (note_id, mute, release_velocity)
 * that must be stripped before passing to add_new_notes.
 * @param rawNote - Note object from get_notes_extended
 * @returns NoteEvent compatible with add_new_notes
 */
function toNoteEvent(rawNote: Record<string, unknown>): NoteEvent {
  return {
    pitch: rawNote.pitch as number,
    start_time: rawNote.start_time as number,
    duration: rawNote.duration as number,
    velocity: rawNote.velocity as number,
    probability: rawNote.probability as number,
    velocity_deviation: rawNote.velocity_deviation as number,
  };
}

/**
 * Apply transforms to existing notes without changing the notes themselves.
 * Used when transforms param is provided but notes param is omitted.
 * @param clip - The clip to update
 * @param transformString - Transform expressions to apply
 * @param timeSigNumerator - Time signature numerator
 * @param timeSigDenominator - Time signature denominator
 * @param clipContext - Clip-level context for transform variables
 * @returns Final note count
 */
export function applyTransformsToExistingNotes(
  clip: LiveAPI,
  transformString: string,
  timeSigNumerator: number,
  timeSigDenominator: number,
  clipContext?: ClipContext,
): number {
  const existingNotesResult = JSON.parse(
    clip.call("get_notes_extended", 0, 128, 0, MAX_CLIP_BEATS) as string,
  );
  const rawNotes = (existingNotesResult?.notes ?? []) as Record<
    string,
    unknown
  >[];

  if (rawNotes.length === 0) {
    console.warn("transforms ignored: clip has no notes to transform");

    return 0;
  }

  // Convert raw notes to NoteEvent format (strips extra Live API properties)
  const notes: NoteEvent[] = rawNotes.map(toNoteEvent);

  applyTransforms(
    notes,
    transformString,
    timeSigNumerator,
    timeSigDenominator,
    clipContext,
  );

  clip.call("remove_notes_extended", 0, 128, 0, MAX_CLIP_BEATS);
  clip.call("add_new_notes", { notes });

  return getPlayableNoteCount(clip);
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
  const lengthBeats = clip.getProperty("length") as number;
  const isArrangementClip =
    (clip.getProperty("is_arrangement_clip") as number) > 0;

  return {
    clipDuration: lengthBeats * (timeSigDenominator / 4),
    clipIndex,
    clipCount,
    arrangementStart: isArrangementClip
      ? (clip.getProperty("start_time") as number) * (timeSigDenominator / 4)
      : undefined,
    barDuration: timeSigNumerator,
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

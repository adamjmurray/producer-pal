// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: AGPL-3.0-or-later

import { applyTransforms } from "#src/notation/transform/transform-evaluator.ts";
import type { NoteEvent } from "#src/notation/types.ts";
import * as console from "#src/shared/v8-max-console.ts";
import { MAX_CLIP_BEATS } from "#src/tools/constants.ts";

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
 * @returns Final note count
 */
export function applyTransformsToExistingNotes(
  clip: LiveAPI,
  transformString: string,
  timeSigNumerator: number,
  timeSigDenominator: number,
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

  applyTransforms(notes, transformString, timeSigNumerator, timeSigDenominator);

  clip.call("remove_notes_extended", 0, 128, 0, MAX_CLIP_BEATS);
  clip.call("add_new_notes", { notes });

  const lengthBeats = clip.getProperty("length") as number;
  const actualNotesResult = JSON.parse(
    clip.call("get_notes_extended", 0, 128, 0, lengthBeats) as string,
  );

  return actualNotesResult?.notes?.length ?? 0;
}

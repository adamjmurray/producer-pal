// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { type NoteEvent } from "#src/notation/types.ts";
import {
  type ClipContext,
  type NoteProperties,
} from "./transform-evaluator-helpers.ts";

/**
 * Build note properties object including note, next note, and clip context
 * @param note - Note event
 * @param noteIndex - 0-based note order in clip
 * @param noteCount - Total number of notes in the clip
 * @param timeSigDenominator - Time signature denominator
 * @param clipContext - Optional clip-level context
 * @param nextNote - Next note in the filtered sequence (undefined for last note)
 * @param nextDistinctStart - Next distinct start_time in the filtered sequence (for legato)
 * @returns Properties for variable access (note.*, next.*, clip.*)
 */
export function buildNoteProperties(
  note: NoteEvent,
  noteIndex: number,
  noteCount: number,
  timeSigDenominator: number,
  clipContext?: ClipContext,
  nextNote?: NoteEvent,
  nextDistinctStart?: number,
): NoteProperties {
  const beatScale = timeSigDenominator / 4;
  const props: NoteProperties = {
    pitch: note.pitch,
    start: note.start_time * beatScale, // Convert to musical beats
    velocity: note.velocity,
    deviation: note.velocity_deviation ?? 0,
    duration: note.duration * beatScale, // Convert to musical beats
    probability: note.probability,
    index: noteIndex,
    count: noteCount,
  };

  if (nextNote) {
    props["next:pitch"] = nextNote.pitch;
    props["next:start"] = nextNote.start_time * beatScale;
    props["next:velocity"] = nextNote.velocity;
    props["next:deviation"] = nextNote.velocity_deviation ?? 0;
    props["next:duration"] = nextNote.duration * beatScale;
    props["next:probability"] = nextNote.probability;
  }

  const noteStartBeats = note.start_time * beatScale;

  if (nextDistinctStart != null) {
    props.legato = nextDistinctStart * beatScale - noteStartBeats;
  } else if (clipContext) {
    const clipEnd =
      (clipContext.arrangementStart ?? 0) + clipContext.clipDuration;

    props.legato = clipEnd - noteStartBeats;
  }

  if (clipContext) {
    props["clip:duration"] = clipContext.clipDuration;
    props["clip:index"] = clipContext.clipIndex;
    props["clip:count"] = clipContext.clipCount;

    if (clipContext.arrangementStart != null) {
      props["clip:position"] = clipContext.arrangementStart;
    }

    props["clip:barDuration"] = clipContext.barDuration;

    if (clipContext.scalePitchClassMask != null) {
      props["scale:mask"] = clipContext.scalePitchClassMask;
    }
  }

  return props;
}

/**
 * Find the next distinct start_time in the filtered note sequence.
 * Skips notes at the same start_time (chord tones) so legato() extends
 * to the next rhythmic position rather than producing zero-length durations.
 * @param currentNote - The current note
 * @param notes - All notes in the clip
 * @param filteredIndices - Indices of notes matching the pitch range filter
 * @param filteredCursor - Current position in filteredIndices (before increment)
 * @returns The next distinct start_time (in Ableton beats), or undefined if none
 */
export function findNextDistinctStart(
  currentNote: NoteEvent,
  notes: NoteEvent[],
  filteredIndices: number[],
  filteredCursor: number,
): number | undefined {
  for (let k = filteredCursor + 1; k < filteredIndices.length; k++) {
    const candidate = notes[filteredIndices[k] as number] as NoteEvent;

    if (candidate.start_time !== currentNote.start_time) {
      return candidate.start_time;
    }
  }

  return undefined;
}

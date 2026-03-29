// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { type NoteEvent } from "#src/notation/types.ts";
import {
  type ClipContext,
  type LegatoContext,
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
 * @param legatoContext - Context for legato() computation (filtered starts, cursor, clip end)
 * @returns Properties for variable access (note.*, next.*, clip.*)
 */
export function buildNoteProperties(
  note: NoteEvent,
  noteIndex: number,
  noteCount: number,
  timeSigDenominator: number,
  clipContext?: ClipContext,
  nextNote?: NoteEvent,
  legatoContext?: LegatoContext,
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

  if (legatoContext) {
    props._legatoContext = legatoContext;
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

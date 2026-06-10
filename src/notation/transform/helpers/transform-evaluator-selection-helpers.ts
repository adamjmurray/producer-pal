// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { type NoteEvent } from "#src/notation/types.ts";
import { errorMessage } from "#src/shared/error-utils.ts";
import * as console from "#src/shared/v8-max-console.ts";
import {
  type PitchRange,
  type PredicateNode,
  type TransformAssignment,
} from "../parser/transform-parser.ts";
import {
  calculateActiveTimeRange,
  evaluateExpression,
  type NoteContext,
  type TimeRange,
} from "./transform-evaluator-helpers.ts";
import { buildNoteProperties } from "./transform-evaluator-note-helpers.ts";
import { evaluatePredicate } from "./transform-predicate-helpers.ts";

/**
 * Select the note indices an assignment applies to: those whose current pitch
 * is within the pitch range AND whose position falls inside the time-range
 * selector. Returned in note order so the caller can derive a selection-local
 * 0-based index for note.index, note.count, next.*, and legato().
 * @param assignment - Transform assignment (supplies the time-range selector)
 * @param pitchRange - Effective pitch range filter (null for no filter)
 * @param notes - Notes to consider (already sorted by start then pitch)
 * @param timeSigNumerator - Time signature numerator
 * @param timeSigDenominator - Time signature denominator
 * @param clipTimeRange - Clip time range used when no selector is present
 * @returns Indices into `notes` of the selected notes, in note order
 */
export function selectAssignmentNotes(
  assignment: TransformAssignment,
  pitchRange: PitchRange | null,
  notes: NoteEvent[],
  timeSigNumerator: number,
  timeSigDenominator: number,
  clipTimeRange: TimeRange,
): number[] {
  const selected: number[] = [];

  for (let idx = 0; idx < notes.length; idx++) {
    const note = notes[idx] as NoteEvent;

    // Pitch range check against current (possibly mutated) pitch
    if (
      pitchRange != null &&
      (note.pitch < pitchRange.startPitch || note.pitch > pitchRange.endPitch)
    ) {
      continue;
    }

    const noteContext = buildNoteContext(
      note,
      timeSigNumerator,
      timeSigDenominator,
      clipTimeRange,
    );

    const activeTimeRange = calculateActiveTimeRange(
      assignment,
      noteContext.bar,
      noteContext.beat,
      timeSigNumerator,
      clipTimeRange,
      noteContext.position,
    );

    if (activeTimeRange.skip) {
      continue;
    }

    // where() predicate filter, AND-combined with the pitch/time selectors above.
    if (
      assignment.predicate != null &&
      !noteMatchesPredicate(
        assignment.predicate,
        note,
        noteContext.position,
        timeSigNumerator,
        timeSigDenominator,
        clipTimeRange,
      )
    ) {
      continue;
    }

    selected.push(idx);
  }

  return selected;
}

/**
 * Evaluate a where() predicate against one note for selection. Predicates may
 * reference only the intrinsic note properties (enforced at parse time), so the
 * 0-valued index/count and the absent next/legato context here are never read — the
 * selected set (and thus those) is not known until selection finishes. A failed
 * evaluation warns and excludes the note (warn-and-skip), matching the apply path.
 * @param predicate - where() predicate AST
 * @param note - Note event to test
 * @param position - Note position in musical beats
 * @param timeSigNumerator - Time signature numerator
 * @param timeSigDenominator - Time signature denominator
 * @param timeRange - Active time range (unused for function-free predicates)
 * @returns Whether the note satisfies the predicate
 */
function noteMatchesPredicate(
  predicate: PredicateNode,
  note: NoteEvent,
  position: number,
  timeSigNumerator: number,
  timeSigDenominator: number,
  timeRange: TimeRange,
): boolean {
  const noteProperties = buildNoteProperties(note, 0, 0, timeSigDenominator);

  try {
    return evaluatePredicate(predicate, {
      position,
      timeSigNumerator,
      timeSigDenominator,
      timeRange,
      noteProperties,
      evaluateExpression,
    });
  } catch (error) {
    console.warn(
      `Failed to evaluate where() predicate: ${errorMessage(error)}`,
    );

    return false;
  }
}

/**
 * Build note context object
 * @param note - Note event
 * @param timeSigNumerator - Time signature numerator
 * @param timeSigDenominator - Time signature denominator
 * @param clipTimeRange - Clip time range
 * @returns Note context for transform evaluation
 */
export function buildNoteContext(
  note: NoteEvent,
  timeSigNumerator: number,
  timeSigDenominator: number,
  clipTimeRange: TimeRange,
): NoteContext {
  // Convert note's Ableton beats start_time to musical beats position
  const musicalBeats = note.start_time * (timeSigDenominator / 4);

  // Derive bar|beat for time-range filtering numerically from the musical-beats
  // position. Do NOT serialize-then-reparse: the serializer emits tuplet/off-grid
  // positions as `±n` offset forms (`1|1+n/12`) that a decimal-only regex cannot
  // read, which would drop bar/beat to undefined and make calculateActiveTimeRange
  // skip time-range filtering entirely (the note would match every selector). The
  // numeric split round-trips exactly through barBeatToMusicalBeats, including negative
  // time (a note before 1|1, where bar can be 0 and beat > beatsPerBar).
  const musicalBeatsPerBar = timeSigNumerator;
  const bar = Math.floor(musicalBeats / musicalBeatsPerBar) + 1;
  const beat = musicalBeats - (bar - 1) * musicalBeatsPerBar + 1;

  return {
    position: musicalBeats,
    pitch: note.pitch,
    bar,
    beat,
    timeSig: {
      numerator: timeSigNumerator,
      denominator: timeSigDenominator,
    },
    clipTimeRange,
  };
}

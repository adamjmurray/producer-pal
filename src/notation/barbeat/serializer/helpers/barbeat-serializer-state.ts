// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { type NoteEvent } from "#src/notation/types.ts";
import { midiToNoteName } from "#src/shared/pitch.ts";
import {
  DEFAULT_PROBABILITY,
  DEFAULT_VELOCITY,
  DEFAULT_VELOCITY_DEVIATION,
  defaultDurationMusicalBeats,
  musicalBeatsToWholeNoteFraction,
} from "../../barbeat-config.ts";
import {
  formatAbsoluteDuration,
  formatDecimal,
} from "./barbeat-serializer-fractions.ts";
import { type TimeGroup } from "./barbeat-serializer-grouping.ts";

/** Mutable state tracked across the serialization process */
export interface SerializerState {
  velocity: number;
  velocityDeviation: number;
  duration: number;
  probability: number;
}

/**
 * Create initial serializer state with default values.
 * The default duration depends on time signature (quarter note in any meter).
 * @param timeSigDenominator - Time signature denominator
 * @returns Fresh serializer state
 */
export function createInitialState(
  timeSigDenominator: number | undefined,
): SerializerState {
  return {
    velocity: DEFAULT_VELOCITY,
    velocityDeviation: DEFAULT_VELOCITY_DEVIATION,
    duration: defaultDurationMusicalBeats(timeSigDenominator),
    probability: DEFAULT_PROBABILITY,
  };
}

/**
 * Check if all notes in a group share the same state values
 * @param notes - Notes to check
 * @returns True if all notes share velocity, duration, probability
 */
function allNotesShareState(notes: NoteEvent[]): boolean {
  if (notes.length <= 1) return true;

  const first = notes[0] as NoteEvent;
  const firstVelocity = Math.round(first.velocity);
  const firstDeviation = Math.round(
    first.velocity_deviation ?? DEFAULT_VELOCITY_DEVIATION,
  );
  const firstDuration = first.duration;
  const firstProbability = first.probability ?? DEFAULT_PROBABILITY;

  for (let i = 1; i < notes.length; i++) {
    const note = notes[i] as NoteEvent;

    if (
      Math.round(note.velocity) !== firstVelocity ||
      Math.round(note.velocity_deviation ?? DEFAULT_VELOCITY_DEVIATION) !==
        firstDeviation ||
      Math.abs(note.duration - firstDuration) > 0.001 ||
      Math.abs((note.probability ?? DEFAULT_PROBABILITY) - firstProbability) >
        0.001
    ) {
      return false;
    }
  }

  return true;
}

/**
 * Format a time group's notes as notation elements, updating state.
 * Handles both shared-state (emit once before pitches) and per-note state
 * (emit before each pitch when notes differ).
 * @param group - Time group to format
 * @param state - Current serializer state (mutated)
 * @param timeSigDenominator - Time signature denominator for duration conversion
 * @returns Array of notation elements (state changes + pitch names)
 */
export function formatGroupNotes(
  group: TimeGroup,
  state: SerializerState,
  timeSigDenominator: number | undefined,
): string[] {
  const elements: string[] = [];

  if (allNotesShareState(group.notes)) {
    // Shared state: emit state changes once, then all pitches
    const firstNote = group.notes[0] as NoteEvent;

    emitStateChanges(firstNote, state, elements, timeSigDenominator);

    for (const note of group.notes) {
      elements.push(pitchName(note.pitch));
    }
  } else {
    // Per-note state: emit state changes before each pitch
    for (const note of group.notes) {
      emitStateChanges(note, state, elements, timeSigDenominator);
      elements.push(pitchName(note.pitch));
    }
  }

  return elements;
}

/**
 * Emit state change elements for a note, updating the serializer state
 * @param note - Note to check against current state
 * @param state - Current serializer state (mutated)
 * @param elements - Output elements array to append to
 * @param timeSigDenominator - Time signature denominator for duration conversion
 */
export function emitStateChanges(
  note: NoteEvent,
  state: SerializerState,
  elements: string[],
  timeSigDenominator: number | undefined,
): void {
  emitVelocityChange(note, state, elements);
  emitDurationChange(note, state, elements, timeSigDenominator);
  emitProbabilityChange(note, state, elements);
}

/**
 * Emit velocity change if different from current state
 * @param note - Note to check
 * @param state - Current state (mutated)
 * @param elements - Output array
 */
function emitVelocityChange(
  note: NoteEvent,
  state: SerializerState,
  elements: string[],
): void {
  const noteVelocity = Math.round(note.velocity);
  const noteDeviation = Math.round(
    note.velocity_deviation ?? DEFAULT_VELOCITY_DEVIATION,
  );

  if (noteDeviation > 0) {
    const velocityMin = Math.max(1, Math.min(127, noteVelocity));
    const velocityMax = Math.min(127, velocityMin + noteDeviation);
    const currentMin = Math.max(1, Math.min(127, state.velocity));
    const currentMax = Math.min(127, currentMin + state.velocityDeviation);

    if (velocityMin !== currentMin || velocityMax !== currentMax) {
      if (velocityMax === velocityMin) {
        elements.push(`v${velocityMin}`);
        state.velocity = velocityMin;
        state.velocityDeviation = 0;
      } else {
        elements.push(`v${velocityMin}-${velocityMax}`);
        state.velocity = velocityMin;
        state.velocityDeviation = velocityMax - velocityMin;
      }
    }
  } else if (noteVelocity !== state.velocity || state.velocityDeviation > 0) {
    elements.push(`v${noteVelocity}`);
    state.velocity = noteVelocity;
    state.velocityDeviation = 0;
  }
}

/**
 * Emit duration change if different from current state.
 * Converts Ableton beats (quarter notes) into notation's musical beats for
 * change detection, and into a whole-note fraction for emission (e.g., /4).
 * @param note - Note to check
 * @param state - Current state (mutated, tracks notation in musical beats)
 * @param elements - Output array
 * @param timeSigDenominator - Time signature denominator for conversion
 */
function emitDurationChange(
  note: NoteEvent,
  state: SerializerState,
  elements: string[],
  timeSigDenominator: number | undefined,
): void {
  // Ableton beats (= quarter notes) → musical beats for state tracking (×1 when
  // the meter is unknown, which is exact). The change threshold bounds an
  // inherited-duration error that lives in Ableton beats, so scale it by the same
  // factor — a flat musical-beat threshold widens to ~0.004 Ableton beats in x/1
  // meters and would drop genuine off-grid duration changes there.
  const denomFactor = timeSigDenominator != null ? timeSigDenominator / 4 : 1;
  const musicalBeats = note.duration * denomFactor;
  const epsilon = 0.001 * denomFactor;

  if (Math.abs(musicalBeats - state.duration) > epsilon) {
    // Emit as an absolute note value (fraction of a whole note)
    const wholeNoteFraction = musicalBeatsToWholeNoteFraction(
      musicalBeats,
      timeSigDenominator,
    );

    elements.push(`n${formatAbsoluteDuration(wholeNoteFraction)}`);
    state.duration = musicalBeats;
  }
}

/**
 * Emit probability change if different from current state
 * @param note - Note to check
 * @param state - Current state (mutated)
 * @param elements - Output array
 */
function emitProbabilityChange(
  note: NoteEvent,
  state: SerializerState,
  elements: string[],
): void {
  const noteProbability = note.probability ?? DEFAULT_PROBABILITY;

  if (Math.abs(noteProbability - state.probability) > 0.001) {
    // Probability grammar uses unsignedDecimal (not unsignedFloat), no fractions
    elements.push(`p${formatDecimal(noteProbability)}`);
    state.probability = noteProbability;
  }
}

/**
 * Get the pitch name for a MIDI note number. The read path filters out-of-range
 * pitches before serializing (see `dropUnnameablePitches`), so a valid pitch is
 * expected here; the fallback keeps this total (never throws) for any caller.
 * @param pitch - MIDI pitch (0-127)
 * @returns Note name string (e.g., "C3"), or `?<pitch>` if unnameable
 */
export function pitchName(pitch: number): string {
  return midiToNoteName(pitch) ?? `?${pitch}`;
}

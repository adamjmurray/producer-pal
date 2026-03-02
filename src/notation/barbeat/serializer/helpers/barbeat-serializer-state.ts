// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { type NoteEvent } from "#src/notation/types.ts";
import { midiToNoteName } from "#src/shared/pitch.ts";
import {
  DEFAULT_DURATION,
  DEFAULT_PROBABILITY,
  DEFAULT_VELOCITY,
  DEFAULT_VELOCITY_DEVIATION,
} from "../../barbeat-config.ts";
import {
  formatDecimal,
  formatUnsignedValue,
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
 * Create initial serializer state with default values
 * @returns Fresh serializer state
 */
export function createInitialState(): SerializerState {
  return {
    velocity: DEFAULT_VELOCITY,
    velocityDeviation: DEFAULT_VELOCITY_DEVIATION,
    duration: DEFAULT_DURATION,
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
 * Converts Ableton beats to notation beats when time signature is specified.
 * @param note - Note to check
 * @param state - Current state (mutated, tracks notation beats)
 * @param elements - Output array
 * @param timeSigDenominator - Time signature denominator for conversion
 */
function emitDurationChange(
  note: NoteEvent,
  state: SerializerState,
  elements: string[],
  timeSigDenominator: number | undefined,
): void {
  // Convert from Ableton beats to notation beats
  const notationDuration =
    timeSigDenominator != null
      ? note.duration * (timeSigDenominator / 4)
      : note.duration;

  if (Math.abs(notationDuration - state.duration) > 0.001) {
    elements.push(`t${formatUnsignedValue(notationDuration)}`);
    state.duration = notationDuration;
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
 * Get the pitch name for a MIDI note number
 * @param pitch - MIDI pitch (0-127)
 * @returns Note name string (e.g., "C3")
 */
export function pitchName(pitch: number): string {
  const name = midiToNoteName(pitch);

  if (name == null) {
    throw new Error(`Invalid MIDI pitch: ${pitch}`);
  }

  return name;
}

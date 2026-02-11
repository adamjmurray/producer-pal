// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: GPL-3.0-or-later

import { midiToNoteName } from "#src/shared/pitch.ts";
import type { NoteEvent } from "../types.ts";
import {
  DEFAULT_DURATION,
  DEFAULT_PROBABILITY,
  DEFAULT_VELOCITY,
  DEFAULT_VELOCITY_DEVIATION,
} from "./barbeat-config.ts";
import { parseBeatsPerBar } from "./time/barbeat-time.ts";

interface TimeGroup {
  bar: number;
  beat: number;
  notes: NoteEvent[];
}

interface FormatOptions {
  beatsPerBar?: number;
  timeSigNumerator?: number;
  timeSigDenominator?: number;
}

/**
 * Format a number to remove trailing zeros
 * @param value - Number to format
 * @returns Formatted number string
 */
function formatNumberWithoutTrailingZeros(value: number): string {
  return value % 1 === 0
    ? value.toString()
    : value.toFixed(3).replace(/\.?0+$/, "");
}

/**
 * Calculate bar and beat from start time
 * @param startTime - Start time in beats
 * @param beatsPerBar - Beats per bar
 * @param timeSigDenominator - Time signature denominator for adjustment
 * @returns Bar and beat position
 */
function calculateBarBeat(
  startTime: number,
  beatsPerBar: number,
  timeSigDenominator: number | undefined,
): { bar: number; beat: number } {
  let adjustedTime = Math.round(startTime * 1000) / 1000;

  if (timeSigDenominator != null) {
    adjustedTime = adjustedTime * (timeSigDenominator / 4);
  }

  const bar = Math.floor(adjustedTime / beatsPerBar) + 1;
  const beat = (adjustedTime % beatsPerBar) + 1;

  return { bar, beat };
}

/**
 * Check if two time positions are at the same moment
 * @param bar1 - First position bar number
 * @param beat1 - First position beat number
 * @param bar2 - Second position bar number
 * @param beat2 - Second position beat number
 * @returns True if positions are at the same moment
 */
function isSameTimePosition(
  bar1: number,
  beat1: number,
  bar2: number,
  beat2: number,
): boolean {
  return bar1 === bar2 && Math.abs(beat1 - beat2) <= 0.001;
}

/**
 * Group notes by their time position
 * @param sortedNotes - Array of sorted note objects
 * @param beatsPerBar - Beats per bar
 * @param timeSigDenominator - Time signature denominator
 * @returns Array of time groups with notes
 */
function groupNotesByTime(
  sortedNotes: NoteEvent[],
  beatsPerBar: number,
  timeSigDenominator: number | undefined,
): TimeGroup[] {
  const timeGroups: TimeGroup[] = [];
  let currentGroup: TimeGroup | null = null;

  for (const note of sortedNotes) {
    const { bar, beat } = calculateBarBeat(
      note.start_time,
      beatsPerBar,
      timeSigDenominator,
    );

    if (
      !currentGroup ||
      !isSameTimePosition(currentGroup.bar, currentGroup.beat, bar, beat)
    ) {
      currentGroup = { bar, beat, notes: [] };
      timeGroups.push(currentGroup);
    }

    currentGroup.notes.push(note);
  }

  return timeGroups;
}

/**
 * Format velocity change and update state
 * @param noteVelocity - Note velocity value
 * @param noteVelocityDeviation - Note velocity deviation
 * @param currentVelocity - Current velocity state
 * @param currentVelocityDeviation - Current velocity deviation state
 * @param elements - Output elements array to append to
 * @returns Updated velocity state
 */
function handleVelocityChange(
  noteVelocity: number,
  noteVelocityDeviation: number,
  currentVelocity: number,
  currentVelocityDeviation: number,
  elements: string[],
): { velocity: number; velocityDeviation: number } {
  if (noteVelocityDeviation > 0) {
    // Clamp velocityMin defensively (protects against invalid data from transforms/Live API)
    const velocityMin = Math.max(1, Math.min(127, noteVelocity));
    const velocityMax = Math.min(127, velocityMin + noteVelocityDeviation);
    const currentVelocityMin = Math.max(1, Math.min(127, currentVelocity));
    const currentVelocityMax = Math.min(
      127,
      currentVelocityMin + currentVelocityDeviation,
    );

    if (
      velocityMin !== currentVelocityMin ||
      velocityMax !== currentVelocityMax
    ) {
      // If clamping reduced the range to a single value, output single velocity
      if (velocityMax === velocityMin) {
        elements.push(`v${velocityMin}`);

        return { velocity: velocityMin, velocityDeviation: 0 };
      }

      elements.push(`v${velocityMin}-${velocityMax}`);

      return {
        velocity: velocityMin,
        velocityDeviation: velocityMax - velocityMin,
      };
    }
  } else if (noteVelocity !== currentVelocity || currentVelocityDeviation > 0) {
    elements.push(`v${noteVelocity}`);

    return { velocity: noteVelocity, velocityDeviation: 0 };
  }

  return {
    velocity: currentVelocity,
    velocityDeviation: currentVelocityDeviation,
  };
}

/**
 * Format duration change and update state
 * @param noteDuration - Note duration value
 * @param currentDuration - Current duration state
 * @param elements - Output elements array to append to
 * @returns Updated duration state
 */
function handleDurationChange(
  noteDuration: number,
  currentDuration: number,
  elements: string[],
): number {
  if (Math.abs(noteDuration - currentDuration) > 0.001) {
    const durationFormatted = formatNumberWithoutTrailingZeros(noteDuration);

    elements.push(`t${durationFormatted}`);

    return noteDuration;
  }

  return currentDuration;
}

/**
 * Format probability change and update state
 * @param noteProbability - Note probability value
 * @param currentProbability - Current probability state
 * @param elements - Output elements array to append to
 * @returns Updated probability state
 */
function handleProbabilityChange(
  noteProbability: number,
  currentProbability: number,
  elements: string[],
): number {
  if (Math.abs(noteProbability - currentProbability) > 0.001) {
    const probabilityFormatted =
      formatNumberWithoutTrailingZeros(noteProbability);

    elements.push(`p${probabilityFormatted}`);

    return noteProbability;
  }

  return currentProbability;
}

/**
 * Format beat value for output
 * @param beat - Beat number to format
 * @returns Formatted beat string
 */
function formatBeat(beat: number): string {
  return formatNumberWithoutTrailingZeros(beat);
}

/**
 * Convert Live clip notes to bar|beat string
 * @param clipNotes - Array of note objects from the Live API
 * @param options - Formatting options
 * @returns bar|beat representation
 */
export function formatNotation(
  clipNotes: NoteEvent[] | null | undefined,
  options: FormatOptions = {},
): string {
  if (!clipNotes || clipNotes.length === 0) {
    return "";
  }

  const { timeSigDenominator } = options;
  const beatsPerBar = parseBeatsPerBar(options);

  // Sort notes by start time, then by pitch for consistent output
  const sortedNotes = [...clipNotes].sort((a, b) => {
    if (a.start_time !== b.start_time) {
      return a.start_time - b.start_time;
    }

    return a.pitch - b.pitch;
  });

  // Group notes by time position
  const timeGroups = groupNotesByTime(
    sortedNotes,
    beatsPerBar,
    timeSigDenominator,
  );

  // Generate output in pitch-first format
  const elements: string[] = [];
  let currentVelocity = DEFAULT_VELOCITY;
  let currentDuration = DEFAULT_DURATION;
  let currentProbability = DEFAULT_PROBABILITY;
  let currentVelocityDeviation = DEFAULT_VELOCITY_DEVIATION;

  for (const group of timeGroups) {
    // Output state changes and notes for this time position
    for (const note of group.notes) {
      // Check velocity/velocity range change
      const noteVelocity = Math.round(note.velocity);
      const noteVelocityDeviation = Math.round(
        note.velocity_deviation ?? DEFAULT_VELOCITY_DEVIATION,
      );

      const velocityState = handleVelocityChange(
        noteVelocity,
        noteVelocityDeviation,
        currentVelocity,
        currentVelocityDeviation,
        elements,
      );

      currentVelocity = velocityState.velocity;
      currentVelocityDeviation = velocityState.velocityDeviation;

      // Check duration change
      const noteDuration = note.duration;

      currentDuration = handleDurationChange(
        noteDuration,
        currentDuration,
        elements,
      );

      // Check probability change
      const noteProbability = note.probability ?? DEFAULT_PROBABILITY;

      currentProbability = handleProbabilityChange(
        noteProbability,
        currentProbability,
        elements,
      );

      // Add note name
      const noteName = midiToNoteName(note.pitch);

      if (noteName == null) {
        throw new Error(`Invalid MIDI pitch: ${note.pitch}`);
      }

      elements.push(noteName);
    }

    // Output time position after all notes for this time
    const beatFormatted = formatBeat(group.beat);

    elements.push(`${group.bar}|${beatFormatted}`);
  }

  return elements.join(" ");
}

// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { type NoteEvent } from "#src/notation/types.ts";
import { parseBeatsPerBar } from "../../time/barbeat-time.ts";

/** A group of notes occurring at the same bar|beat position */
export interface TimeGroup {
  bar: number;
  beat: number;
  notes: NoteEvent[];
}

/** Format options for the serializer */
export interface FormatOptions {
  beatsPerBar?: number;
  timeSigNumerator?: number;
  timeSigDenominator?: number;
  drumMode?: boolean;
}

/** Parsed format config with computed values */
export interface FormatConfig {
  beatsPerBar: number;
  timeSigDenominator: number | undefined;
}

/**
 * Parse format options into a resolved config
 * @param options - Raw format options
 * @returns Resolved format config
 */
export function resolveFormatConfig(options: FormatOptions): FormatConfig {
  return {
    beatsPerBar: parseBeatsPerBar(options),
    timeSigDenominator: options.timeSigDenominator,
  };
}

/**
 * Sort notes by start_time (stable sort with pitch as tiebreaker)
 * @param notes - Array of note events
 * @returns Sorted copy of the array
 */
export function sortNotes(notes: NoteEvent[]): NoteEvent[] {
  return [...notes].sort((a, b) => {
    if (a.start_time !== b.start_time) {
      return a.start_time - b.start_time;
    }

    return a.pitch - b.pitch;
  });
}

/**
 * Calculate bar and beat from start time in Ableton beats
 * @param startTime - Start time in Ableton beats (quarter notes)
 * @param beatsPerBar - Beats per bar
 * @param timeSigDenominator - Time signature denominator for adjustment
 * @returns Bar and beat position (1-based)
 */
export function calculateBarBeat(
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
 * Group sorted notes by their time position
 * @param sortedNotes - Array of sorted note events
 * @param config - Format configuration
 * @returns Array of time groups
 */
export function groupNotesByTime(
  sortedNotes: NoteEvent[],
  config: FormatConfig,
): TimeGroup[] {
  const { beatsPerBar, timeSigDenominator } = config;
  const timeGroups: TimeGroup[] = [];
  let currentBar = -1;
  let currentBeat = -1;

  for (const note of sortedNotes) {
    const { bar, beat } = calculateBarBeat(
      note.start_time,
      beatsPerBar,
      timeSigDenominator,
    );

    if (bar !== currentBar || Math.abs(beat - currentBeat) > 0.001) {
      timeGroups.push({ bar, beat, notes: [] });
      currentBar = bar;
      currentBeat = beat;
    }

    // Loop invariant: we always push a group before reaching this point
    const lastGroup = timeGroups.at(-1) as TimeGroup;

    lastGroup.notes.push(note);
  }

  return timeGroups;
}

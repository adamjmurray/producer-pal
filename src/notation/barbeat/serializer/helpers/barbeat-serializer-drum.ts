// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { type NoteEvent } from "#src/notation/types.ts";
import {
  DEFAULT_PROBABILITY,
  DEFAULT_VELOCITY_DEVIATION,
  musicalBeatsToWholeNoteFraction,
} from "../../barbeat-config.ts";
import {
  formatAbsoluteDuration,
  formatBeatPosition,
} from "./barbeat-serializer-fractions.ts";
import {
  calculateBarBeat,
  type FormatConfig,
} from "./barbeat-serializer-grouping.ts";
import {
  createInitialState,
  emitStateChanges,
  pitchName,
} from "./barbeat-serializer-state.ts";

/** A beat position with bar and beat components */
interface Position {
  bar: number;
  beat: number;
}

/** A run of notes with identical state (velocity, duration, probability) */
interface StateRun {
  notes: NoteEvent[];
  positions: Position[];
}

/**
 * Format notes in drum mode — grouped by pitch with repeat pattern detection.
 * Each drum pad gets its own section with all beat positions.
 * @param sortedNotes - Notes sorted by start_time
 * @param config - Format configuration
 * @returns Compact drum notation string
 */
export function formatDrumNotation(
  sortedNotes: NoteEvent[],
  config: FormatConfig,
): string {
  const pitchGroups = groupByPitch(sortedNotes);
  const state = createInitialState();
  const lines: string[] = [];

  for (const { pitch, notes } of pitchGroups) {
    const positions = notes.map((n) =>
      calculateBarBeat(
        n.start_time,
        config.beatsPerBar,
        config.timeSigDenominator,
      ),
    );
    const runs = splitIntoStateRuns(notes, positions);
    const elements: string[] = [];

    for (const run of runs) {
      emitStateChanges(
        run.notes[0] as NoteEvent,
        state,
        elements,
        config.timeSigDenominator,
      );
      elements.push(pitchName(pitch));
      elements.push(
        ...formatPositions(
          run.positions,
          state.duration,
          config.beatsPerBar,
          config.timeSigDenominator,
        ),
      );
    }

    // One drum pad per line. State (velocity/duration) carries across lines —
    // newlines are whitespace to the parser — so a pad only re-emits v/n on
    // change, exactly like the regular per-batch path.
    lines.push(elements.join(" "));
  }

  return lines.join("\n");
}

/**
 * Group notes by pitch, ordered by first occurrence of each pitch
 * @param sortedNotes - Notes sorted by start_time
 * @returns Pitch groups in order of first appearance
 */
function groupByPitch(
  sortedNotes: NoteEvent[],
): Array<{ pitch: number; notes: NoteEvent[] }> {
  const map = new Map<number, NoteEvent[]>();

  for (const note of sortedNotes) {
    const existing = map.get(note.pitch);

    if (existing) {
      existing.push(note);
    } else {
      map.set(note.pitch, [note]);
    }
  }

  return [...map.entries()].map(([pitch, notes]) => ({ pitch, notes }));
}

/**
 * Split a pitch group into runs of notes with identical state.
 * Notes within a run share velocity, velocity_deviation, duration, and probability.
 * @param notes - Notes for one pitch
 * @param positions - Corresponding bar|beat positions
 * @returns Array of state runs
 */
function splitIntoStateRuns(
  notes: NoteEvent[],
  positions: Position[],
): StateRun[] {
  const runs: StateRun[] = [];
  let runStart = 0;

  for (let i = 1; i <= notes.length; i++) {
    if (
      i === notes.length ||
      !sameState(notes[runStart] as NoteEvent, notes[i] as NoteEvent)
    ) {
      runs.push({
        notes: notes.slice(runStart, i),
        positions: positions.slice(runStart, i),
      });
      runStart = i;
    }
  }

  return runs;
}

/**
 * Check if two notes have identical state (velocity, duration, probability)
 * @param a - First note
 * @param b - Second note
 * @returns True if states match
 */
function sameState(a: NoteEvent, b: NoteEvent): boolean {
  return (
    Math.round(a.velocity) === Math.round(b.velocity) &&
    Math.round(a.velocity_deviation ?? DEFAULT_VELOCITY_DEVIATION) ===
      Math.round(b.velocity_deviation ?? DEFAULT_VELOCITY_DEVIATION) &&
    Math.abs(a.duration - b.duration) <= 0.001 &&
    Math.abs(
      (a.probability ?? DEFAULT_PROBABILITY) -
        (b.probability ?? DEFAULT_PROBABILITY),
    ) <= 0.001
  );
}

/**
 * Format beat positions, using repeat patterns when shorter.
 * Groups positions by bar for comma merging, then checks for repeat patterns.
 * @param positions - Bar|beat positions to format
 * @param currentDuration - Current duration state in musical beats (for step omission)
 * @param beatsPerBar - Beats per bar for absolute beat calculation
 * @param timeSigDenominator - Time signature denominator (for step fraction conversion)
 * @returns Formatted position strings
 */
function formatPositions(
  positions: Position[],
  currentDuration: number,
  beatsPerBar: number,
  timeSigDenominator: number | undefined,
): string[] {
  const repeat = detectRepeatPattern(
    positions,
    beatsPerBar,
    timeSigDenominator,
  );

  if (repeat) {
    return [
      formatRepeat(
        repeat,
        currentDuration,
        positions[0] as Position,
        timeSigDenominator,
      ),
    ];
  }

  return formatBarBeatPositions(positions, timeSigDenominator);
}

/** Repeat pattern info */
interface RepeatInfo {
  count: number;
  /** Step in musical beats (for comparison against currentDuration). */
  step: number;
  /** Step pre-formatted as an absolute fraction string (e.g., "/4"). */
  stepStr: string;
}

/**
 * Detect evenly-spaced repeat pattern in positions (3+ positions required)
 * @param positions - Bar|beat positions
 * @param beatsPerBar - Beats per bar
 * @param timeSigDenominator - Time signature denominator (for step fraction conversion)
 * @returns Repeat info or null
 */
function detectRepeatPattern(
  positions: Position[],
  beatsPerBar: number,
  timeSigDenominator: number | undefined,
): RepeatInfo | null {
  if (positions.length < 3) return null;

  const absolutes = positions.map(
    (p) => (p.bar - 1) * beatsPerBar + (p.beat - 1),
  );
  const step = (absolutes[1] as number) - (absolutes[0] as number);

  if (step <= 0) return null;

  for (let i = 2; i < absolutes.length; i++) {
    if (
      Math.abs((absolutes[i] as number) - (absolutes[i - 1] as number) - step) >
      0.002
    ) {
      return null;
    }
  }

  const stepStr = formatAbsoluteDuration(
    musicalBeatsToWholeNoteFraction(step, timeSigDenominator),
  );

  // Check that repeat format is actually shorter than listing positions
  const repeatStr = formatRepeatLength(
    positions[0] as Position,
    positions.length,
    stepStr,
    timeSigDenominator,
  );
  const listStr = formatBarBeatPositions(positions, timeSigDenominator).join(
    " ",
  );

  if (repeatStr >= listStr.length) return null;

  return { count: positions.length, step, stepStr };
}

/**
 * Estimate length of a repeat pattern string
 * @param start - Start position
 * @param count - Repeat count
 * @param stepStr - Pre-formatted step string
 * @param timeSigDenominator - Time signature denominator (for the offset unit)
 * @returns Estimated string length
 */
function formatRepeatLength(
  start: Position,
  count: number,
  stepStr: string,
  timeSigDenominator: number | undefined,
): number {
  const startStr = `${start.bar}|${formatBeatPosition(start.beat, timeSigDenominator)}`;

  // bar|beatx{count}@n{step} or bar|beatx{count} (the "@n" sigil is 2 chars)
  return startStr.length + 1 + count.toString().length + 2 + stepStr.length;
}

/**
 * Format a repeat pattern string
 * @param repeat - Repeat info
 * @param currentDuration - Current duration in musical beats (omit @step if equal)
 * @param start - Start position
 * @param timeSigDenominator - Time signature denominator (for the offset unit)
 * @returns Repeat pattern string like "1|1x8@n/4"
 */
function formatRepeat(
  repeat: RepeatInfo,
  currentDuration: number,
  start: Position,
  timeSigDenominator: number | undefined,
): string {
  const startStr = `${start.bar}|${formatBeatPosition(start.beat, timeSigDenominator)}`;
  const stepSuffix =
    Math.abs(repeat.step - currentDuration) <= 0.001
      ? ""
      : `@n${repeat.stepStr}`;

  return `${startStr}x${repeat.count}${stepSuffix}`;
}

/**
 * Format positions as bar|beat groups with comma merging within bars
 * @param positions - Bar|beat positions
 * @param timeSigDenominator - Time signature denominator (for the offset unit)
 * @returns Formatted position strings
 */
function formatBarBeatPositions(
  positions: Position[],
  timeSigDenominator: number | undefined,
): string[] {
  const result: string[] = [];
  let currentBar = -1;
  let currentBeats: string[] = [];

  for (const pos of positions) {
    if (pos.bar !== currentBar) {
      if (currentBeats.length > 0) {
        result.push(`${currentBar}|${currentBeats.join(",")}`);
      }

      currentBar = pos.bar;
      currentBeats = [formatBeatPosition(pos.beat, timeSigDenominator)];
    } else {
      currentBeats.push(formatBeatPosition(pos.beat, timeSigDenominator));
    }
  }

  if (currentBeats.length > 0) {
    result.push(`${currentBar}|${currentBeats.join(",")}`);
  }

  return result;
}

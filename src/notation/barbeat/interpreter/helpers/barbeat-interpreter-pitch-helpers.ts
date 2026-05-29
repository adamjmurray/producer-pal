// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: GPL-3.0-or-later

import { wholeNoteFractionToMusicalBeats } from "#src/notation/barbeat/barbeat-config.ts";
import * as console from "#src/shared/v8-max-console.ts";
import { assertDefined } from "#src/tools/shared/utils.ts";
import { type NoteEvent, type BarCopyNote } from "../../../types.ts";
import {
  type PitchState,
  type InterpreterState,
  type TimePosition,
} from "./barbeat-interpreter-buffer-helpers.ts";

export interface RepeatPattern {
  start: number;
  times: number;
  step?: number | null;
  stepBars?: number;
}

export interface TimeElement {
  bar?: number;
  beat?: number | RepeatPattern;
}

/**
 * Expand a repeat pattern into multiple beat positions.
 * The parser emits `pattern.step` as a fraction of a whole note; convert to
 * musical beats here so it can be added to positions (also in musical beats).
 * @param pattern - Repeat pattern to expand
 * @param currentBar - Current bar number
 * @param beatsPerBar - Beats per bar (musical beats)
 * @param currentDuration - Current note duration in musical beats (used when @step is omitted)
 * @param timeSigDenominator - Time signature denominator (for step unit conversion)
 * @returns Array of time positions
 */
function expandRepeatPattern(
  pattern: RepeatPattern,
  currentBar: number,
  beatsPerBar: number,
  currentDuration: number,
  timeSigDenominator: number | undefined,
): TimePosition[] {
  const { start, times, step: stepValue, stepBars } = pattern;
  // @step omitted (null) defaults to the current duration (legato). Otherwise
  // combine the whole-note fraction (scaled by the denominator) with the
  // meter-aware bar component (@1bar) scaled by beatsPerBar.
  const step =
    stepValue == null
      ? currentDuration
      : wholeNoteFractionToMusicalBeats(stepValue, timeSigDenominator) +
        (stepBars ?? 0) * beatsPerBar;

  if (times > 100) {
    console.warn(
      `Repeat pattern generates ${times} notes, which may be excessive`,
    );
  }

  const positions: TimePosition[] = [];

  // Convert starting position to absolute beats (0-based)
  const startBeats = (currentBar - 1) * beatsPerBar + (start - 1);

  for (let i = 0; i < times; i++) {
    const absoluteBeats = startBeats + i * step;
    const bar = Math.floor(absoluteBeats / beatsPerBar) + 1;
    const beat = (absoluteBeats % beatsPerBar) + 1;

    positions.push({ bar, beat });
  }

  return positions;
}

/**
 * Emit a single pitch at a position, creating note event and tracking for bar copy
 * @param pitchState - Pitch state to emit
 * @param position - Time position
 * @param beatsPerBar - Beats per bar
 * @param timeSigDenominator - Time signature denominator
 * @param events - Output events array
 * @param notesByBar - Notes by bar cache
 */
function emitPitchAtPosition(
  pitchState: PitchState,
  position: TimePosition,
  beatsPerBar: number,
  timeSigDenominator: number | undefined,
  events: NoteEvent[],
  notesByBar: Map<number, BarCopyNote[]>,
): void {
  // Convert bar|beat to absolute beats
  const absoluteBeats = (position.bar - 1) * beatsPerBar + (position.beat - 1);
  // Convert to Ableton beats
  const abletonBeats =
    timeSigDenominator != null
      ? absoluteBeats * (4 / timeSigDenominator)
      : absoluteBeats;
  const abletonDuration =
    timeSigDenominator != null
      ? pitchState.duration * (4 / timeSigDenominator)
      : pitchState.duration;
  const noteEvent: NoteEvent = {
    pitch: pitchState.pitch,
    start_time: abletonBeats,
    duration: abletonDuration,
    velocity: pitchState.velocity,
    probability: pitchState.probability,
    velocity_deviation: pitchState.velocityDeviation,
  };

  events.push(noteEvent);

  // Track for bar copy: calculate actual bar from note position
  const barDuration =
    timeSigDenominator != null
      ? beatsPerBar * (4 / timeSigDenominator)
      : beatsPerBar;
  const actualBar = Math.floor(abletonBeats / barDuration) + 1;
  const barStartAbletonBeats = (actualBar - 1) * barDuration;
  const relativeAbletonBeats = abletonBeats - barStartAbletonBeats;

  if (!notesByBar.has(actualBar)) {
    notesByBar.set(actualBar, []);
  }

  // Add to bar copy buffer (v0 notes will be filtered by applyV0Deletions at the end)
  const barNotes = notesByBar.get(actualBar);

  if (barNotes) {
    barNotes.push({
      ...noteEvent,
      relativeTime: relativeAbletonBeats,
      originalBar: actualBar,
    });
  }
}

/**
 * Emit all pitches at multiple positions
 * @param positions - Array of time positions
 * @param currentPitches - Array of pitch states
 * @param element - Time element
 * @param beatsPerBar - Beats per bar
 * @param timeSigDenominator - Time signature denominator
 * @param events - Output events array
 * @param notesByBar - Notes by bar cache
 * @returns Current time and bar number flag
 */
function emitPitchesAtPositions(
  positions: TimePosition[],
  currentPitches: PitchState[],
  beatsPerBar: number,
  timeSigDenominator: number | undefined,
  events: NoteEvent[],
  notesByBar: Map<number, BarCopyNote[]>,
): { currentTime: TimePosition | null } {
  let currentTime: TimePosition | null = null;

  for (const position of positions) {
    currentTime = position;

    for (const pitchState of currentPitches) {
      emitPitchAtPosition(
        pitchState,
        currentTime,
        beatsPerBar,
        timeSigDenominator,
        events,
        notesByBar,
      );
    }
  }

  return { currentTime };
}

/**
 * Calculate positions from time element
 * @param element - Time element
 * @param state - Interpreter state
 * @param beatsPerBar - Beats per bar (musical beats)
 * @param timeSigDenominator - Time signature denominator
 * @returns Array of time positions
 */
export function calculatePositions(
  element: TimeElement,
  state: InterpreterState,
  beatsPerBar: number,
  timeSigDenominator: number | undefined,
): TimePosition[] {
  // bar is always defined when this function is called (checked at barbeat-interpreter.ts dispatch)
  const bar = element.bar as number;

  if (typeof element.beat === "object") {
    return expandRepeatPattern(
      element.beat,
      bar,
      beatsPerBar,
      state.currentDuration,
      timeSigDenominator,
    );
  }

  const beat = element.beat as number;

  return [{ bar, beat }];
}

/**
 * Handle pitch emission or warn if no pitches
 * @param positions - Array of time positions
 * @param state - Interpreter state
 * @param beatsPerBar - Beats per bar
 * @param timeSigDenominator - Time signature denominator
 * @param events - Output events array
 * @param notesByBar - Notes by bar cache
 */
export function handlePitchEmission(
  positions: TimePosition[],
  state: InterpreterState,
  beatsPerBar: number,
  timeSigDenominator: number | undefined,
  events: NoteEvent[],
  notesByBar: Map<number, BarCopyNote[]>,
): void {
  if (state.currentPitches.length === 0) {
    if (positions.length === 1) {
      const pos = assertDefined(positions[0], "single position");

      console.warn(`Time position ${pos.bar}|${pos.beat} has no pitches`);
    } else if (positions.length > 0) {
      const pos = assertDefined(positions[0], "first position");

      console.warn(
        `Time position has no pitches (first position: ${pos.bar}|${pos.beat})`,
      );
    }

    return;
  }

  if (state.stateChangedSinceLastPitch) {
    console.warn(
      "state change after pitch(es) but before time position won't affect this group",
    );
  }

  const emitResult = emitPitchesAtPositions(
    positions,
    state.currentPitches,
    beatsPerBar,
    timeSigDenominator,
    events,
    notesByBar,
  );

  if (emitResult.currentTime != null) {
    state.currentTime = emitResult.currentTime;
  }

  state.pitchesEmitted = true;
}

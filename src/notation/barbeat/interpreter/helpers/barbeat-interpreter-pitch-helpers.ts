// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: GPL-3.0-or-later

import * as console from "#src/shared/v8-max-console.ts";
import { assertDefined } from "#src/tools/shared/utils.ts";
import type { NoteEvent, BarCopyNote } from "../../../types.ts";
import type {
  PitchState,
  InterpreterState,
  TimePosition,
} from "./barbeat-interpreter-buffer-helpers.ts";

export interface RepeatPattern {
  start: number;
  times: number;
  step?: number | null;
}

export interface TimeElement {
  bar?: number | null;
  beat?: number | RepeatPattern;
}

/**
 * Expand a repeat pattern into multiple beat positions
 * @param pattern - Repeat pattern to expand
 * @param currentBar - Current bar number
 * @param beatsPerBar - Beats per bar
 * @param currentDuration - Current note duration
 * @returns Array of time positions
 */
function expandRepeatPattern(
  pattern: RepeatPattern,
  currentBar: number,
  beatsPerBar: number,
  currentDuration: number,
): TimePosition[] {
  const { start, times, step: stepValue } = pattern;
  const step = stepValue ?? currentDuration;

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
  element: TimeElement,
  beatsPerBar: number,
  timeSigDenominator: number | undefined,
  events: NoteEvent[],
  notesByBar: Map<number, BarCopyNote[]>,
): { currentTime: TimePosition | null; hasExplicitBarNumber: boolean } {
  let currentTime: TimePosition | null = null;
  let hasExplicitBarNumber = false;

  for (const position of positions) {
    currentTime = position;

    if (element.bar !== null) {
      hasExplicitBarNumber = true;
    }

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

  return { currentTime, hasExplicitBarNumber };
}

/**
 * Calculate positions from time element
 * @param element - Time element
 * @param state - Interpreter state
 * @param beatsPerBar - Beats per bar
 * @returns Array of time positions
 */
export function calculatePositions(
  element: TimeElement,
  state: InterpreterState,
  beatsPerBar: number,
): TimePosition[] {
  if (typeof element.beat === "object") {
    const currentBar =
      element.bar ?? (state.hasExplicitBarNumber ? state.currentTime.bar : 1);

    return expandRepeatPattern(
      element.beat,
      currentBar,
      beatsPerBar,
      state.currentDuration,
    );
  }

  const bar =
    element.bar ?? (state.hasExplicitBarNumber ? state.currentTime.bar : 1);
  const beat = element.beat as number;

  return [{ bar, beat }];
}

/**
 * Handle pitch emission or warn if no pitches
 * @param positions - Array of time positions
 * @param state - Interpreter state
 * @param element - Time element
 * @param beatsPerBar - Beats per bar
 * @param timeSigDenominator - Time signature denominator
 * @param events - Output events array
 * @param notesByBar - Notes by bar cache
 */
export function handlePitchEmission(
  positions: TimePosition[],
  state: InterpreterState,
  element: TimeElement,
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
    element,
    beatsPerBar,
    timeSigDenominator,
    events,
    notesByBar,
  );

  if (emitResult.currentTime != null) {
    state.currentTime = emitResult.currentTime;
  }

  if (emitResult.hasExplicitBarNumber) {
    state.hasExplicitBarNumber = true;
  }

  state.pitchesEmitted = true;
}

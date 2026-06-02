// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import {
  DEFAULT_VELOCITY,
  DEFAULT_VELOCITY_DEVIATION,
  wholeNoteFractionToMusicalBeats,
} from "#src/notation/barbeat/barbeat-config.ts";
import * as console from "#src/shared/v8-max-console.ts";
import { assertDefined } from "#src/tools/shared/utils.ts";
import { type NoteEvent, type BarCopyNote } from "../../../types.ts";
import {
  type PitchState,
  type InterpreterState,
  type TimePosition,
} from "./barbeat-interpreter-buffer-helpers.ts";
import {
  advanceStreamCursors,
  applyStreamOverrides,
  streamValueAt,
} from "./barbeat-interpreter-stream-helpers.ts";

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

  warnIfBeforeClipStart(startBeats);

  // Running-sum fold rather than the closed-form `startBeats + i * step`:
  // `absoluteBeats` accumulates one `advance` (= `step`) per emission. For a
  // constant advance this equals the closed form (within float epsilon), so
  // behavior is unchanged. The fold is the shape that lets a future per-emit
  // cycling duration vary `advance` per step (pattern brackets / streams) — see
  // "Pattern Brackets (Streams)" in dev/specs/BarBeat-Spec.md.
  let absoluteBeats = startBeats;

  for (let i = 0; i < times; i++) {
    const bar = Math.floor(absoluteBeats / beatsPerBar) + 1;
    // Floored modulo (not bare `%`): JS `%` is truncated, keeping the dividend's
    // sign, so a negative absoluteBeats (a repeat landing before the clip start,
    // e.g. `1|1-n/8x2`) would decompose into a {bar, beat} that no longer
    // recomposes to the same time in emitPitchAtPosition — placing the note bars
    // away from where it belongs. The grammar's borrowBars wraps sub-1 beats the
    // same (floored) way; match it so the round-trip is exact.
    const beat =
      (((absoluteBeats % beatsPerBar) + beatsPerBar) % beatsPerBar) + 1;

    positions.push({ bar, beat });
    absoluteBeats += step;
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
 * Emit a pitch stream across multiple positions, zipping value to position by a
 * cursor that carries across separate time positions. `pitchStream` is a stream
 * of chords (each element is a chord = one or more simultaneous pitches); the
 * `i`-th position emits the chord at `pitchStream[(startCursor + i) mod length]`.
 * A plain (unbracketed) chord is a length-1 stream, so every position re-emits
 * the same chord — the existing broadcast. Pattern brackets (streams) make the
 * stream longer so the value cycles, and `startCursor` lets a bracket continue
 * cycling across multiple position tokens (cross-event cursor; see "Pattern
 * Brackets (Streams)" in dev/specs/BarBeat-Spec.md).
 * Any active velocity/duration/probability value stream OVERRIDES the captured
 * per-pitch value at each emission, cycled by its own carried cursor (the zip).
 * @param positions - Array of time positions
 * @param pitchStream - Stream of chords (length 1 for unbracketed input)
 * @param state - Interpreter state (carries the per-parameter cursors + streams)
 * @param beatsPerBar - Beats per bar
 * @param timeSigDenominator - Time signature denominator
 * @param events - Output events array
 * @param notesByBar - Notes by bar cache
 * @returns Current time
 */
function emitPitchesAtPositions(
  positions: TimePosition[],
  pitchStream: PitchState[][],
  state: InterpreterState,
  beatsPerBar: number,
  timeSigDenominator: number | undefined,
  events: NoteEvent[],
  notesByBar: Map<number, BarCopyNote[]>,
): { currentTime: TimePosition | null } {
  let currentTime: TimePosition | null = null;

  for (const [i, position] of positions.entries()) {
    currentTime = position;
    // Modulo keeps the index in range (stream length is always >= 1), so the
    // chord is always defined; the cast documents the guaranteed bounds.
    const chord = pitchStream[
      (state.pitchStreamCursor + i) % pitchStream.length
    ] as PitchState[];
    const velocity = streamValueAt(
      state.currentVelocityStream,
      state.velocityStreamCursor,
      i,
    );
    const duration = streamValueAt(
      state.currentDurationStream,
      state.durationStreamCursor,
      i,
    );
    const probability = streamValueAt(
      state.currentProbabilityStream,
      state.probabilityStreamCursor,
      i,
    );

    for (const pitchState of chord) {
      emitPitchAtPosition(
        applyStreamOverrides(pitchState, velocity, duration, probability),
        position,
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
 * Build a PitchState for one pitch by snapshotting the current velocity,
 * duration, and probability. Velocity comes from an active range (min +
 * deviation) when set, else the single current velocity. Shared by plain pitch
 * elements and pattern-bracket stream values so both capture state identically.
 * @param pitch - MIDI pitch number
 * @param state - Interpreter state to snapshot
 * @returns Pitch state ready to emit
 */
export function buildPitchState(
  pitch: number,
  state: InterpreterState,
): PitchState {
  let velocity: number;
  let velocityDeviation: number;

  if (state.currentVelocityMin != null && state.currentVelocityMax != null) {
    velocity = state.currentVelocityMin;
    velocityDeviation = state.currentVelocityMax - state.currentVelocityMin;
  } else {
    velocity = state.currentVelocity ?? DEFAULT_VELOCITY;
    velocityDeviation = DEFAULT_VELOCITY_DEVIATION;
  }

  return {
    pitch,
    velocity,
    velocityDeviation,
    duration: state.currentDuration,
    probability: state.currentProbability,
  };
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

  warnIfBeforeClipStart((bar - 1) * beatsPerBar + (beat - 1));

  return [{ bar, beat }];
}

/**
 * Warn (once per position) when a resolved position lands before the clip start
 * (negative absolute beats). A `-n` offset can pull a note before 1|1; Live
 * accepts notes at negative time, but they won't appear when reading the clip
 * back (reads start at time 0), so flag it without throwing.
 * @param absoluteBeats - Resolved position in absolute musical beats (0-based)
 */
function warnIfBeforeClipStart(absoluteBeats: number): void {
  if (absoluteBeats < 0) {
    console.warn(
      "Note position resolves before the clip start (negative time): it sits before 1|1.",
    );
  }
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
  // A pending pattern bracket is the pitch source when present; otherwise the
  // single current chord as a length-1 stream. All-length-1 ⇒ today's broadcast.
  const pitchStream = state.currentPitchStream ?? [state.currentPitches];
  const totalPitches = pitchStream.reduce(
    (sum, chord) => sum + chord.length,
    0,
  );

  if (totalPitches === 0) {
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
    pitchStream,
    state,
    beatsPerBar,
    timeSigDenominator,
    events,
    notesByBar,
  );

  if (emitResult.currentTime != null) {
    state.currentTime = emitResult.currentTime;
  }

  // Advance every parameter cursor once per emitted note-event so each stream
  // continues cycling at the next time position (cross-event cursor). Harmless
  // for length-1 / inactive streams (`cursor mod 1` is 0; inactive cursors reset
  // on reassignment).
  advanceStreamCursors(state, positions.length);
  state.pitchesEmitted = true;
}

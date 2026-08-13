// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import {
  DEFAULT_VELOCITY,
  DEFAULT_VELOCITY_DEVIATION,
  wholeNoteFractionToMusicalBeats,
} from "#src/notation/barbeat/barbeat-config.ts";
import { assertDefined } from "#src/shared/error-utils.ts";
import * as console from "#src/shared/max/v8-max-console.ts";
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
 * @param state - Interpreter state (current duration + duration stream/cursor)
 * @param timeSigDenominator - Time signature denominator (for step unit conversion)
 * @returns Array of time positions
 */
function expandRepeatPattern(
  pattern: RepeatPattern,
  currentBar: number,
  beatsPerBar: number,
  state: InterpreterState,
  timeSigDenominator: number | undefined,
): TimePosition[] {
  const { start, times, step: stepValue, stepBars } = pattern;
  // @step present → a fixed advance: the whole-note fraction (scaled by the
  // denominator) plus the meter-aware bar component (@1bar) scaled by
  // beatsPerBar. @step omitted → null, so the per-emission advance below falls
  // back to the note duration (cycled stream value, else the scalar).
  const fixedStep =
    stepValue == null
      ? null
      : wholeNoteFractionToMusicalBeats(stepValue, timeSigDenominator) +
        (stepBars ?? 0) * beatsPerBar;

  // The grammar enforces a positive @step, but it checks the raw fraction/bars
  // BEFORE the meter is applied, so a minus tail that cancels the bar component
  // (`@1bar-n4/4` → 0 in 4/4, `@1bar-n5/4` → negative) slips past it. Re-check
  // the resolved value here: a non-positive advance would stack or reverse the
  // repeats. Same contract and message as the parse-time guard.
  if (fixedStep != null && fixedStep <= 0) {
    throw new Error("Repeat step size must be greater than 0");
  }

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
  // `absoluteBeats` accumulates one `advance` per emission. With a fixed @step
  // this equals the closed form (within float epsilon). With @step omitted and
  // a duration stream active, the advance is the just-emitted note's CYCLED
  // duration (`durStream[(cursor + i) mod len]`) — the duration-fold ("gallop"),
  // where each note's length and the spacing to the next note track together.
  // The cursor base is `state.durationStreamCursor` (advanced only after
  // emission), so this position computation and the length emission read the
  // same values. See "Pattern Brackets (Streams)" in dev/specs/BarBeat-Spec.md.
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
    absoluteBeats +=
      fixedStep ??
      streamValueAt(
        state.currentDurationStream,
        state.durationStreamCursor,
        i,
      ) ??
      state.currentDuration;
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

  // Add to bar copy buffer (v0 notes will be filtered by applyV0Deletions at the end)
  let barNotes = notesByBar.get(actualBar);

  if (barNotes == null) {
    barNotes = [];
    notesByBar.set(actualBar, barNotes);
  }

  barNotes.push({
    ...noteEvent,
    relativeTime: relativeAbletonBeats,
    originalBar: actualBar,
  });
}

/**
 * Emit layered pitch voices across multiple positions, zipping value to position
 * by a cursor that carries across separate time positions. `voices` is a list of
 * voices, each a stream of chords; the chord emitted at the `i`-th position is
 * the UNION over all voices of `voice[(startCursor + i) mod voice.length]`. Pitch
 * brackets LAYER — each voice cycles by its own length, so voices of unequal
 * length phase against each other. A single unbracketed chord is one length-1
 * voice, so every position re-emits the same chord (the existing broadcast).
 * `startCursor` lets the voices continue cycling across multiple position tokens
 * (cross-event cursor; see "Pattern Brackets (Streams)" in
 * dev/specs/BarBeat-Spec.md).
 * Any active velocity/duration/probability value stream OVERRIDES the captured
 * per-pitch value at each emission, cycled by its own carried cursor (the zip);
 * it applies to the whole layered chord.
 * @param positions - Array of time positions
 * @param voices - List of pitch voices (each a stream of chords; >= 1 voice)
 * @param state - Interpreter state (carries the per-parameter cursors + streams)
 * @param beatsPerBar - Beats per bar
 * @param timeSigDenominator - Time signature denominator
 * @param events - Output events array
 * @param notesByBar - Notes by bar cache
 * @returns Current time
 */
function emitPitchesAtPositions(
  positions: TimePosition[],
  voices: PitchState[][][],
  state: InterpreterState,
  beatsPerBar: number,
  timeSigDenominator: number | undefined,
  events: NoteEvent[],
  notesByBar: Map<number, BarCopyNote[]>,
): { currentTime: TimePosition | null } {
  let currentTime: TimePosition | null = null;

  for (const [i, position] of positions.entries()) {
    currentTime = position;
    // Each voice cycles by its own length (always >= 1), so the per-voice chord
    // is always defined; the cast documents the guaranteed bounds. flatMap
    // unions the voices' chords into the layered chord emitted at this position.
    const chord = voices.flatMap(
      (voice) =>
        voice[(state.pitchStreamCursor + i) % voice.length] as PitchState[],
    );
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
      state,
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
  // The voices that layer at each position: the single current chord (a
  // length-1 voice, present only when bare pitches were captured) plus every
  // pattern-bracket voice. With no brackets and one chord this is today's
  // broadcast; with multiple voices they stack and phase (pitch layering).
  const voices: PitchState[][][] =
    state.currentPitches.length > 0
      ? [[state.currentPitches], ...state.currentPitchStreams]
      : [...state.currentPitchStreams];
  const totalPitches = voices.reduce(
    (sum, voice) =>
      sum + voice.reduce((voiceSum, chord) => voiceSum + chord.length, 0),
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
      "velocity/duration/probability set after the note(s) but before the time position has no effect: these apply to the notes that follow, so put the setting before them (v1 C4, not C4 v1)",
    );
  }

  const emitResult = emitPitchesAtPositions(
    positions,
    voices,
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

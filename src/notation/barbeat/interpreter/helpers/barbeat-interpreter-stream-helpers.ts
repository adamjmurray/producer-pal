// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import {
  DEFAULT_VELOCITY_DEVIATION,
  wholeNoteFractionToMusicalBeats,
} from "#src/notation/barbeat/barbeat-config.ts";
import {
  type StreamDuration,
  type StreamProbability,
  type StreamVelocity,
} from "#src/notation/barbeat/parser/barbeat-parser.ts";
import {
  type InterpreterState,
  type PitchState,
  type StreamVelocityValue,
} from "./barbeat-interpreter-buffer-helpers.ts";
import {
  clampProbability,
  clampVelocity,
} from "./barbeat-interpreter-range-helpers.ts";

/**
 * Resolve a velocity stream's raw AST values into emit-ready velocity values.
 * A single `v80` becomes `{velocity, deviation: 0}`; a range `v40-80` becomes
 * `{velocity: min, deviation: max - min}` — the same clamp + deviation logic
 * `buildPitchState` applies to a scalar velocity, so a streamed velocity is
 * indistinguishable from a captured one at emission.
 * @param values - Raw velocity stream values from the parser
 * @returns Emit-ready velocity values
 */
export function buildVelocityStream(
  values: StreamVelocity[],
): StreamVelocityValue[] {
  return values.map((value) => {
    if ("velocityMin" in value) {
      const min = clampVelocity(value.velocityMin, "velocity range min");
      const max = clampVelocity(value.velocityMax, "velocity range max");

      return { velocity: min, velocityDeviation: max - min };
    }

    return {
      velocity: clampVelocity(value.velocity, "velocity"),
      velocityDeviation: DEFAULT_VELOCITY_DEVIATION,
    };
  });
}

/**
 * Resolve a duration stream's raw AST values into musical beats. Mirrors
 * `processDurationUpdate`: the whole-note fraction scales by the time-signature
 * denominator and the bar component by beatsPerBar. The stream cycles each
 * note's LENGTH; with `@step` omitted those same cycled values also advance the
 * position (the duration-fold — see `expandRepeatPattern`).
 * @param values - Raw duration stream values from the parser
 * @param beatsPerBar - Beats per bar (musical beats)
 * @param timeSigDenominator - Time signature denominator
 * @returns Durations in musical beats
 */
export function buildDurationStream(
  values: StreamDuration[],
  beatsPerBar: number,
  timeSigDenominator: number | undefined,
): number[] {
  return values.map((value) => {
    const fractionBeats = wholeNoteFractionToMusicalBeats(
      value.duration,
      timeSigDenominator,
    );

    return (value.bars ?? 0) * beatsPerBar + fractionBeats;
  });
}

/**
 * Resolve a probability stream's raw AST values into clamped probabilities.
 * @param values - Raw probability stream values from the parser
 * @returns Clamped probabilities (0-1)
 */
export function buildProbabilityStream(values: StreamProbability[]): number[] {
  return values.map((value) => clampProbability(value.probability));
}

/**
 * Read a value stream at emission `i`, honoring its carried cursor. Returns null
 * when the stream is inactive, so emission falls back to the captured per-pitch
 * value. The modulo keeps the index in range (length is always >= 1 when the
 * stream is non-null), so the element is defined; the cast documents that.
 * @param stream - The active value stream, or null
 * @param cursor - Cursor carried in from prior emissions
 * @param offset - Emission offset within the current position batch
 * @returns The cycled value, or null when no stream is active
 */
export function streamValueAt<T>(
  stream: T[] | null | undefined,
  cursor: number,
  offset: number,
): T | null {
  if (stream == null) {
    return null;
  }

  return stream[(cursor + offset) % stream.length] as T;
}

/**
 * Produce the emit-ready pitch state for one note-event, letting any active
 * value stream OVERRIDE the value captured into the PitchState. When no stream
 * is active (all overrides null) the PitchState is returned unchanged, so the
 * common no-stream path allocates nothing and the legacy per-pitch capture
 * (`v80 C3 v100 E3`) is preserved exactly.
 * @param pitchState - The captured pitch state (legacy per-pitch values)
 * @param velocity - Streamed velocity override, or null
 * @param duration - Streamed duration override (musical beats), or null
 * @param probability - Streamed probability override, or null
 * @returns The effective pitch state to emit
 */
export function applyStreamOverrides(
  pitchState: PitchState,
  velocity: StreamVelocityValue | null,
  duration: number | null,
  probability: number | null,
): PitchState {
  if (velocity == null && duration == null && probability == null) {
    return pitchState;
  }

  return {
    pitch: pitchState.pitch,
    velocity: velocity != null ? velocity.velocity : pitchState.velocity,
    velocityDeviation:
      velocity != null
        ? velocity.velocityDeviation
        : pitchState.velocityDeviation,
    duration: duration ?? pitchState.duration,
    probability: probability ?? pitchState.probability,
  };
}

/**
 * Advance every parameter stream's cursor once per emitted note-event. All
 * active streams tick in lockstep (each instantiated at its own lexical point,
 * so the per-parameter cursors stay independent). Advancing an inactive
 * stream's cursor is harmless — it resets to 0 when the parameter is reassigned.
 * @param state - Interpreter state
 * @param count - Number of note-events emitted (positions in this batch)
 */
export function advanceStreamCursors(
  state: InterpreterState,
  count: number,
): void {
  state.pitchStreamCursor += count;
  state.velocityStreamCursor += count;
  state.durationStreamCursor += count;
  state.probabilityStreamCursor += count;
}

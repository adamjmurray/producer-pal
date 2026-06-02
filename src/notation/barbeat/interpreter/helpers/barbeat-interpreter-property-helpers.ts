// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import {
  DEFAULT_VELOCITY_DEVIATION,
  wholeNoteFractionToMusicalBeats,
} from "#src/notation/barbeat/barbeat-config.ts";
import { type ASTElement } from "#src/notation/barbeat/parser/barbeat-parser.ts";
import {
  handlePropertyUpdate,
  type InterpreterState,
  type PitchState,
} from "./barbeat-interpreter-buffer-helpers.ts";
import {
  clampProbability,
  clampVelocity,
} from "./barbeat-interpreter-range-helpers.ts";

/**
 * Process a velocity update (single value)
 * @param element - AST element with velocity value
 * @param state - Interpreter state
 */
export function processVelocityUpdate(
  element: ASTElement,
  state: InterpreterState,
): void {
  const velocity = clampVelocity(element.velocity as number, "velocity");

  state.currentVelocity = velocity;
  state.currentVelocityMin = null;
  state.currentVelocityMax = null;
  clearValueStream(state, "velocity");

  handlePropertyUpdate(state, (pitchState: PitchState) => {
    pitchState.velocity = velocity;
    pitchState.velocityDeviation = DEFAULT_VELOCITY_DEVIATION;
  });
}

/**
 * Process a velocity range update
 * @param element - AST element with velocity range
 * @param state - Interpreter state
 */
export function processVelocityRangeUpdate(
  element: ASTElement,
  state: InterpreterState,
): void {
  const velocityMin = clampVelocity(
    element.velocityMin ?? 0,
    "velocity range min",
  );
  const velocityMax = clampVelocity(
    element.velocityMax ?? 0,
    "velocity range max",
  );

  state.currentVelocityMin = velocityMin;
  state.currentVelocityMax = velocityMax;
  state.currentVelocity = null;
  clearValueStream(state, "velocity");

  handlePropertyUpdate(state, (pitchState: PitchState) => {
    pitchState.velocity = velocityMin;
    pitchState.velocityDeviation = velocityMax - velocityMin;
  });
}

/**
 * Process a duration update.
 * The grammar emits the sub-bar part as a fraction of a whole note (e.g., 1/4
 * for a quarter) and an optional meter-aware `bars` count (`1bar`, `1bar+n3/4`).
 * Convert both to musical beats: the fraction scales by the time-signature
 * denominator, the bars by beatsPerBar.
 * @param element - AST element with duration value
 * @param state - Interpreter state
 * @param beatsPerBar - Beats per bar (musical beats; for the bar component)
 * @param timeSigDenominator - Time signature denominator
 */
export function processDurationUpdate(
  element: ASTElement,
  state: InterpreterState,
  beatsPerBar: number,
  timeSigDenominator: number | undefined,
): void {
  const fractionBeats = wholeNoteFractionToMusicalBeats(
    element.duration ?? 0,
    timeSigDenominator,
  );
  const barBeats = (element.bars ?? 0) * beatsPerBar;

  state.currentDuration = barBeats + fractionBeats;
  clearValueStream(state, "duration");

  handlePropertyUpdate(state, (pitchState: PitchState) => {
    pitchState.duration = state.currentDuration;
  });
}

/**
 * Process a probability update
 * @param element - AST element with probability value
 * @param state - Interpreter state
 */
export function processProbabilityUpdate(
  element: ASTElement,
  state: InterpreterState,
): void {
  const probability = clampProbability(element.probability as number);

  state.currentProbability = probability;
  clearValueStream(state, "probability");

  handlePropertyUpdate(state, (pitchState: PitchState) => {
    pitchState.probability = probability;
  });
}

/**
 * Clear an active value stream for one parameter (and rewind its cursor).
 * Called when a scalar reassigns the parameter, so a later `v60` / `n/8` / `p1`
 * replaces a `[...]` value stream with the constant — the spec's "a later scalar
 * replaces the stream" rule. The pitch stream has its own reset path.
 * @param state - Interpreter state
 * @param param - Which value stream to clear
 */
function clearValueStream(
  state: InterpreterState,
  param: "velocity" | "duration" | "probability",
): void {
  if (param === "velocity") {
    state.currentVelocityStream = null;
    state.velocityStreamCursor = 0;
  } else if (param === "duration") {
    state.currentDurationStream = null;
    state.durationStreamCursor = 0;
  } else {
    state.currentProbabilityStream = null;
    state.probabilityStreamCursor = 0;
  }
}

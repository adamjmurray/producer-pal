// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import * as console from "./transform-warning-label.ts";
import {
  type TimeRange,
  type NoteProperties,
} from "./helpers/transform-evaluator-helpers.ts";
import {
  computePhase,
  evaluateArgs,
  evaluateChoose,
  evaluateClipSeq,
  evaluateCurve,
  evaluateMathFunction,
  evaluateMinMax,
  evaluatePow,
  evaluateRand,
  evaluateSeq,
} from "./helpers/transform-functions-helpers.ts";
import {
  evaluateSnap,
  evaluateStep,
} from "./helpers/transform-functions-scale-helpers.ts";
import {
  evaluateLegato,
  evaluateQuant,
  evaluateSwing,
} from "./helpers/transform-functions-timing-helpers.ts";
import { type ExpressionNode } from "./parser/transform-parser.ts";
import * as waveforms from "./transform-waveforms.ts";

export type EvaluateExpressionFn = (
  node: ExpressionNode,
  position: number,
  timeSigNumerator: number,
  timeSigDenominator: number,
  timeRange: TimeRange,
  noteProperties?: NoteProperties,
) => number;

// Dispatch map for functions with the standard (args, pos, num, den, range, props, eval) signature
const standardFnDispatch: Record<string, typeof evaluateRand | undefined> = {
  rand: evaluateRand,
  seq: evaluateSeq,
  clipseq: evaluateClipSeq,
  choose: evaluateChoose,
  snap: evaluateSnap,
  quant: evaluateQuant,
  step: evaluateStep,
  pow: evaluatePow,
  curve: evaluateCurve,
  ramp: evaluateRamp,
};

/**
 * Evaluate a function call
 * @param name - Function name
 * @param args - Function arguments
 * @param sync - Whether to sync phase to arrangement timeline
 * @param raw - Whether to skip auto-quantize (swing only)
 * @param position - Note position in beats
 * @param timeSigNumerator - Time signature numerator
 * @param timeSigDenominator - Time signature denominator
 * @param timeRange - Active time range
 * @param noteProperties - Note properties for variable access
 * @param evaluateExpression - Expression evaluator function
 * @returns Evaluated function result
 */
export function evaluateFunction(
  name: string,
  args: ExpressionNode[],
  sync: boolean,
  raw: boolean,
  position: number,
  timeSigNumerator: number,
  timeSigDenominator: number,
  timeRange: TimeRange,
  noteProperties: NoteProperties,
  evaluateExpression: EvaluateExpressionFn,
): number {
  // legato([tolerance]) — duration to next distinct start time (skips chord tones)
  if (name === "legato") {
    return evaluateLegato(
      args,
      position,
      timeSigNumerator,
      timeSigDenominator,
      timeRange,
      noteProperties,
      evaluateExpression,
    );
  }

  // swing() has its own signature due to the raw flag
  if (name === "swing") {
    return evaluateSwing(
      args,
      raw,
      position,
      timeSigNumerator,
      timeSigDenominator,
      timeRange,
      noteProperties,
      evaluateExpression,
    );
  }

  // Functions with standard signature: (args, pos, num, den, range, props, eval)
  const standardFn = standardFnDispatch[name];

  if (standardFn) {
    return standardFn(
      args,
      position,
      timeSigNumerator,
      timeSigDenominator,
      timeRange,
      noteProperties,
      evaluateExpression,
    );
  }

  // Math functions with name dispatch (round, floor, ceil, abs, clamp)
  if (
    name === "round" ||
    name === "floor" ||
    name === "ceil" ||
    name === "abs" ||
    name === "clamp" ||
    name === "wrap" ||
    name === "reflect"
  ) {
    return evaluateMathFunction(
      name,
      args,
      position,
      timeSigNumerator,
      timeSigDenominator,
      timeRange,
      noteProperties,
      evaluateExpression,
    );
  }

  // Math functions - variadic (min, max)
  if (name === "min" || name === "max") {
    return evaluateMinMax(
      name,
      args,
      position,
      timeSigNumerator,
      timeSigDenominator,
      timeRange,
      noteProperties,
      evaluateExpression,
    );
  }

  // All other waveforms require at least a period argument
  return evaluateWaveform(
    name,
    args,
    sync,
    position,
    timeSigNumerator,
    timeSigDenominator,
    timeRange,
    noteProperties,
    evaluateExpression,
  );
}

/**
 * Evaluate ramp function
 * @param args - Function arguments (exactly 2: start, end)
 * @param position - Note position in beats
 * @param timeSigNumerator - Time signature numerator
 * @param timeSigDenominator - Time signature denominator
 * @param timeRange - Active time range
 * @param noteProperties - Note properties for variable access
 * @param evaluateExpression - Expression evaluator function
 * @returns Ramp value
 */
function evaluateRamp(
  args: ExpressionNode[],
  position: number,
  timeSigNumerator: number,
  timeSigDenominator: number,
  timeRange: TimeRange,
  noteProperties: NoteProperties,
  evaluateExpression: EvaluateExpressionFn,
): number {
  if (args.length !== 2) {
    throw new Error(
      `Function ramp() requires exactly 2 arguments: ramp(start, end)`,
    );
  }

  const [start, end] = evaluateArgs(
    args,
    [0, 1],
    position,
    timeSigNumerator,
    timeSigDenominator,
    timeRange,
    noteProperties,
    evaluateExpression,
  );
  const phase = computePhase(position, timeRange);

  return waveforms.ramp(phase, start, end);
}

/**
 * Evaluate waveform function (cos, sin, tri, saw, square)
 * @param name - Waveform function name
 * @param args - Function arguments
 * @param sync - Whether to sync phase to arrangement timeline
 * @param position - Note position in beats
 * @param timeSigNumerator - Time signature numerator
 * @param timeSigDenominator - Time signature denominator
 * @param timeRange - Active time range
 * @param noteProperties - Note properties for variable access
 * @param evaluateExpression - Expression evaluator function
 * @returns Waveform value
 */
function evaluateWaveform(
  name: string,
  args: ExpressionNode[],
  sync: boolean,
  position: number,
  timeSigNumerator: number,
  timeSigDenominator: number,
  timeRange: TimeRange,
  noteProperties: NoteProperties,
  evaluateExpression: EvaluateExpressionFn,
): number {
  // All waveforms require at least a period argument. square also takes an
  // optional pulseWidth (3rd arg); the rest cap at period + phase. sync is a
  // trailing keyword, not an arg, so it isn't counted here.
  if (args.length === 0) {
    throw new Error(`Function ${name}() requires at least a period argument`);
  }

  const maxArgs = name === "square" ? 3 : 2;

  if (args.length > maxArgs) {
    const signature =
      name === "square"
        ? `${name}(period, [phase], [pulseWidth])`
        : `${name}(period, [phase])`;

    throw new Error(
      `Function ${name}() takes at most ${maxArgs} arguments: ${signature}`,
    );
  }

  // First argument is the period: a note-value or numeric expression, in beats
  const period = parsePeriod(
    args[0] as ExpressionNode,
    position,
    timeSigNumerator,
    timeSigDenominator,
    timeRange,
    noteProperties,
    evaluateExpression,
    name,
  );

  // Sync: use absolute arrangement position for phase
  let effectivePosition = position;

  if (sync) {
    const arrangementStart = noteProperties["clip:position"];

    if (arrangementStart == null) {
      // Session clips have no arrangement origin to anchor phase. Degrade
      // gracefully to clip-relative (phase resets at clip start) instead of
      // skipping the whole assignment — mirrors the clip.position variable
      // fallback. effectivePosition stays at the clip-relative position.
      console.warn("sync ignored on session clip — LFO is clip-relative");
    } else {
      effectivePosition = position + arrangementStart;
    }
  }

  // Calculate phase from position and period
  const basePhase = (effectivePosition / period) % 1.0;

  // Optional second argument: phase offset
  let phaseOffset = 0;

  if (args.length >= 2) {
    phaseOffset = evaluateExpression(
      args[1] as ExpressionNode,
      position,
      timeSigNumerator,
      timeSigDenominator,
      timeRange,
      noteProperties,
    );
  }

  const phase = basePhase + phaseOffset;

  // Call the waveform function
  switch (name) {
    case "cos":
      return waveforms.cos(phase);

    case "sin":
      return waveforms.sin(phase);

    case "tri":
      return waveforms.tri(phase);

    case "saw":
      return waveforms.saw(phase);

    case "square": {
      // Optional third argument: pulseWidth
      let pulseWidth = 0.5; // default

      if (args.length >= 3) {
        pulseWidth = evaluateExpression(
          args[2] as ExpressionNode,
          position,
          timeSigNumerator,
          timeSigDenominator,
          timeRange,
          noteProperties,
        );
      }

      return waveforms.square(phase, pulseWidth);
    }

    default:
      throw new Error(`Unknown waveform function: ${name}()`);
  }
}

/**
 * Parse period argument for waveform/timing functions.
 * The period is any numeric expression — a note value (e.g. `n/4`), a variable
 * (e.g. `clip.barDuration`), or a bare number — evaluated to musical beats.
 * @param periodArg - Period expression
 * @param position - Note position in beats
 * @param timeSigNumerator - Time signature numerator
 * @param timeSigDenominator - Time signature denominator
 * @param timeRange - Active time range
 * @param noteProperties - Note properties for variable access
 * @param evaluateExpression - Expression evaluator function
 * @param name - Function name for error messages
 * @returns Period in beats
 */
export function parsePeriod(
  periodArg: ExpressionNode,
  position: number,
  timeSigNumerator: number,
  timeSigDenominator: number,
  timeRange: TimeRange,
  noteProperties: NoteProperties,
  evaluateExpression: EvaluateExpressionFn,
  name: string,
): number {
  const period = evaluateExpression(
    periodArg,
    position,
    timeSigNumerator,
    timeSigDenominator,
    timeRange,
    noteProperties,
  );

  if (period <= 0) {
    throw new Error(`Function ${name}() period must be > 0, got ${period}`);
  }

  return period;
}

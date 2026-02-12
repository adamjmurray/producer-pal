// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import type { ExpressionNode } from "./parser/transform-parser.ts";
import type {
  TimeRange,
  NoteProperties,
} from "./transform-evaluator-helpers.ts";
import { parseFrequency, type PeriodObject } from "./transform-frequency.ts";
import {
  evaluateChoose,
  evaluateCurve,
  evaluateMathFunction,
  evaluateMinMax,
  evaluatePow,
  evaluateRand,
} from "./transform-functions-helpers.ts";
import * as waveforms from "./transform-waveforms.ts";

export type EvaluateExpressionFn = (
  node: ExpressionNode,
  position: number,
  timeSigNumerator: number,
  timeSigDenominator: number,
  timeRange: TimeRange,
  noteProperties?: NoteProperties,
) => number;

/**
 * Evaluate a function call
 * @param name - Function name
 * @param args - Function arguments
 * @param sync - Whether to sync phase to arrangement timeline
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
  position: number,
  timeSigNumerator: number,
  timeSigDenominator: number,
  timeRange: TimeRange,
  noteProperties: NoteProperties,
  evaluateExpression: EvaluateExpressionFn,
): number {
  // rand() - random value with 0/1/2 arguments
  if (name === "rand") {
    return evaluateRand(
      args,
      position,
      timeSigNumerator,
      timeSigDenominator,
      timeRange,
      noteProperties,
      evaluateExpression,
    );
  }

  // choose() - random selection from arguments
  if (name === "choose") {
    return evaluateChoose(
      args,
      position,
      timeSigNumerator,
      timeSigDenominator,
      timeRange,
      noteProperties,
      evaluateExpression,
    );
  }

  // Math functions (round, floor, ceil, abs, clamp)
  if (
    name === "round" ||
    name === "floor" ||
    name === "ceil" ||
    name === "abs" ||
    name === "clamp"
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

  // Math function - binary (pow)
  if (name === "pow") {
    return evaluatePow(
      args,
      position,
      timeSigNumerator,
      timeSigDenominator,
      timeRange,
      noteProperties,
      evaluateExpression,
    );
  }

  // ramp() is special - it uses timeRange instead of period
  if (name === "ramp") {
    return evaluateRamp(
      args,
      position,
      timeSigNumerator,
      timeSigDenominator,
      timeRange,
      noteProperties,
      evaluateExpression,
    );
  }

  // curve() - exponential ramp using timeRange
  if (name === "curve") {
    return evaluateCurve(
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
 * @param args - Function arguments
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
  if (args.length < 2 || args.length > 3) {
    throw new Error(
      `Function ramp() requires 2-3 arguments: ramp(start, end, speed?)`,
    );
  }

  // First argument: start value
  const start = evaluateExpression(
    args[0] as ExpressionNode,
    position,
    timeSigNumerator,
    timeSigDenominator,
    timeRange,
    noteProperties,
  );

  // Second argument: end value
  const end = evaluateExpression(
    args[1] as ExpressionNode,
    position,
    timeSigNumerator,
    timeSigDenominator,
    timeRange,
    noteProperties,
  );

  // Optional third argument: speed (default 1)
  let speed = 1;

  if (args.length >= 3) {
    speed = evaluateExpression(
      args[2] as ExpressionNode,
      position,
      timeSigNumerator,
      timeSigDenominator,
      timeRange,
      noteProperties,
    );

    if (speed <= 0) {
      throw new Error(`Function ramp() speed must be > 0, got ${speed}`);
    }
  }

  // Calculate phase based on position within timeRange
  const timeRangeDuration = timeRange.end - timeRange.start;
  const phase =
    timeRangeDuration > 0
      ? (position - timeRange.start) / timeRangeDuration
      : 0;

  return waveforms.ramp(phase, start, end, speed);
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
  // All waveforms require at least a period argument
  if (args.length === 0) {
    throw new Error(`Function ${name}() requires at least a period argument`);
  }

  // First argument is period (either period type with "t" suffix, or a number expression)
  const period = parsePeriod(
    args[0] as ExpressionNode | PeriodObject,
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
      throw new Error(
        "sync requires an arrangement clip (no clip.position available)",
      );
    }

    effectivePosition = position + arrangementStart;
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
 * Parse period argument for waveform functions
 * @param periodArg - Period argument (expression or period object)
 * @param position - Note position in beats
 * @param timeSigNumerator - Time signature numerator
 * @param timeSigDenominator - Time signature denominator
 * @param timeRange - Active time range
 * @param noteProperties - Note properties for variable access
 * @param evaluateExpression - Expression evaluator function
 * @param name - Function name for error messages
 * @returns Period in beats
 */
function parsePeriod(
  periodArg: ExpressionNode | PeriodObject,
  position: number,
  timeSigNumerator: number,
  timeSigDenominator: number,
  timeRange: TimeRange,
  noteProperties: NoteProperties,
  evaluateExpression: EvaluateExpressionFn,
  name: string,
): number {
  let period;

  // Check if it's a period object (has "period" type)
  if (
    typeof periodArg === "object" &&
    "type" in periodArg &&
    periodArg.type === "period"
  ) {
    period = parseFrequency(periodArg, timeSigNumerator);
  } else {
    // Evaluate as expression (e.g., variable or number) - treated as beats
    period = evaluateExpression(
      periodArg as ExpressionNode,
      position,
      timeSigNumerator,
      timeSigDenominator,
      timeRange,
      noteProperties,
    );

    if (period <= 0) {
      throw new Error(`Function ${name}() period must be > 0, got ${period}`);
    }
  }

  return period;
}

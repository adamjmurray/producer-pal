// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import type { ExpressionNode } from "./parser/transform-parser.ts";
import type {
  TimeRange,
  NoteProperties,
} from "./transform-evaluator-helpers.ts";
import type { EvaluateExpressionFn } from "./transform-functions.ts";
import * as waveforms from "./transform-waveforms.ts";

/**
 * Evaluate rand function
 * @param args - Function arguments (0, 1, or 2)
 * @param position - Note position in beats
 * @param timeSigNumerator - Time signature numerator
 * @param timeSigDenominator - Time signature denominator
 * @param timeRange - Active time range
 * @param noteProperties - Note properties for variable access
 * @param evaluateExpression - Expression evaluator function
 * @returns Random value in configured range
 */
export function evaluateRand(
  args: ExpressionNode[],
  position: number,
  timeSigNumerator: number,
  timeSigDenominator: number,
  timeRange: TimeRange,
  noteProperties: NoteProperties,
  evaluateExpression: EvaluateExpressionFn,
): number {
  if (args.length > 2) {
    throw new Error(
      `Function rand() accepts 0-2 arguments: rand(), rand(max), or rand(min, max)`,
    );
  }

  // No args: random -1 to 1
  if (args.length === 0) {
    return waveforms.rand(-1, 1);
  }

  // One arg: random 0 to max
  if (args.length === 1) {
    const max = evaluateExpression(
      args[0] as ExpressionNode,
      position,
      timeSigNumerator,
      timeSigDenominator,
      timeRange,
      noteProperties,
    );

    return waveforms.rand(0, max);
  }

  // Two args: random min to max
  const min = evaluateExpression(
    args[0] as ExpressionNode,
    position,
    timeSigNumerator,
    timeSigDenominator,
    timeRange,
    noteProperties,
  );
  const max = evaluateExpression(
    args[1] as ExpressionNode,
    position,
    timeSigNumerator,
    timeSigDenominator,
    timeRange,
    noteProperties,
  );

  return waveforms.rand(min, max);
}

/**
 * Evaluate choose function
 * @param args - Function arguments (at least 1)
 * @param position - Note position in beats
 * @param timeSigNumerator - Time signature numerator
 * @param timeSigDenominator - Time signature denominator
 * @param timeRange - Active time range
 * @param noteProperties - Note properties for variable access
 * @param evaluateExpression - Expression evaluator function
 * @returns One randomly selected value from the arguments
 */
export function evaluateChoose(
  args: ExpressionNode[],
  position: number,
  timeSigNumerator: number,
  timeSigDenominator: number,
  timeRange: TimeRange,
  noteProperties: NoteProperties,
  evaluateExpression: EvaluateExpressionFn,
): number {
  if (args.length === 0) {
    throw new Error("Function choose() requires at least 1 argument");
  }

  const values = args.map((arg) =>
    evaluateExpression(
      arg,
      position,
      timeSigNumerator,
      timeSigDenominator,
      timeRange,
      noteProperties,
    ),
  );

  return waveforms.choose(values);
}

/**
 * Evaluate curve function
 * @param args - Function arguments (exactly 3: start, end, exponent)
 * @param position - Note position in beats
 * @param timeSigNumerator - Time signature numerator
 * @param timeSigDenominator - Time signature denominator
 * @param timeRange - Active time range
 * @param noteProperties - Note properties for variable access
 * @param evaluateExpression - Expression evaluator function
 * @returns Exponentially interpolated value
 */
export function evaluateCurve(
  args: ExpressionNode[],
  position: number,
  timeSigNumerator: number,
  timeSigDenominator: number,
  timeRange: TimeRange,
  noteProperties: NoteProperties,
  evaluateExpression: EvaluateExpressionFn,
): number {
  if (args.length !== 3) {
    throw new Error(
      `Function curve() requires exactly 3 arguments: curve(start, end, exponent)`,
    );
  }

  const start = evaluateExpression(
    args[0] as ExpressionNode,
    position,
    timeSigNumerator,
    timeSigDenominator,
    timeRange,
    noteProperties,
  );

  const end = evaluateExpression(
    args[1] as ExpressionNode,
    position,
    timeSigNumerator,
    timeSigDenominator,
    timeRange,
    noteProperties,
  );

  const exponent = evaluateExpression(
    args[2] as ExpressionNode,
    position,
    timeSigNumerator,
    timeSigDenominator,
    timeRange,
    noteProperties,
  );

  if (exponent <= 0) {
    throw new Error(`Function curve() exponent must be > 0, got ${exponent}`);
  }

  // Calculate phase based on position within timeRange (same as ramp)
  const timeRangeDuration = timeRange.end - timeRange.start;
  const phase =
    timeRangeDuration > 0
      ? (position - timeRange.start) / timeRangeDuration
      : 0;

  return waveforms.curve(phase, start, end, exponent);
}

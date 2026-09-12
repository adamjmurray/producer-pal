// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { type ExpressionNode } from "../../parser/transform-parser.ts";
import { type EvaluateExpressionFn } from "../../transform-functions.ts";
import * as waveforms from "../../transform-waveforms.ts";
import { type NoteProperties, type TimeRange } from "../transform-context.ts";
import { computePhase, evaluateArgs } from "./function-arguments.ts";

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

  const [start, end, exponent] = evaluateArgs(
    args,
    [0, 1, 2],
    position,
    timeSigNumerator,
    timeSigDenominator,
    timeRange,
    noteProperties,
    evaluateExpression,
  );

  if (exponent <= 0) {
    throw new Error(`Function curve() exponent must be > 0, got ${exponent}`);
  }

  const phase = computePhase(position, timeRange);

  return waveforms.curve(phase, start, end, exponent);
}

/**
 * Evaluate pow function (exactly 2 arguments: base, exponent)
 * @param args - Function arguments
 * @param position - Note position in beats
 * @param timeSigNumerator - Time signature numerator
 * @param timeSigDenominator - Time signature denominator
 * @param timeRange - Active time range
 * @param noteProperties - Note properties for variable access
 * @param evaluateExpression - Expression evaluator function
 * @returns base raised to the power of exponent
 */
export function evaluatePow(
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
      `Function pow() requires exactly 2 arguments: pow(base, exponent)`,
    );
  }

  const base = evaluateExpression(
    args[0] as ExpressionNode,
    position,
    timeSigNumerator,
    timeSigDenominator,
    timeRange,
    noteProperties,
  );

  const exponent = evaluateExpression(
    args[1] as ExpressionNode,
    position,
    timeSigNumerator,
    timeSigDenominator,
    timeRange,
    noteProperties,
  );

  const result = Math.pow(base, exponent);

  if (!Number.isFinite(result)) {
    throw new Error(
      `Function pow(${base}, ${exponent}) produced a non-finite result`,
    );
  }

  return result;
}

/**
 * Evaluate min/max function (variadic - accepts 2+ arguments)
 * @param name - Function name ("min" or "max")
 * @param args - Function arguments
 * @param position - Note position in beats
 * @param timeSigNumerator - Time signature numerator
 * @param timeSigDenominator - Time signature denominator
 * @param timeRange - Active time range
 * @param noteProperties - Note properties for variable access
 * @param evaluateExpression - Expression evaluator function
 * @returns Min or max of all arguments
 */
export function evaluateMinMax(
  name: string,
  args: ExpressionNode[],
  position: number,
  timeSigNumerator: number,
  timeSigDenominator: number,
  timeRange: TimeRange,
  noteProperties: NoteProperties,
  evaluateExpression: EvaluateExpressionFn,
): number {
  if (args.length < 2) {
    throw new Error(`Function ${name}() requires at least 2 arguments`);
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

  return name === "min" ? Math.min(...values) : Math.max(...values);
}

/**
 * Evaluate math function (round, floor, ceil, abs, clamp, wrap, reflect)
 * @param name - Function name
 * @param args - Function arguments
 * @param position - Note position in beats
 * @param timeSigNumerator - Time signature numerator
 * @param timeSigDenominator - Time signature denominator
 * @param timeRange - Active time range
 * @param noteProperties - Note properties for variable access
 * @param evaluateExpression - Expression evaluator function
 * @returns Math function result
 */
export function evaluateMathFunction(
  name: string,
  args: ExpressionNode[],
  position: number,
  timeSigNumerator: number,
  timeSigDenominator: number,
  timeRange: TimeRange,
  noteProperties: NoteProperties,
  evaluateExpression: EvaluateExpressionFn,
): number {
  if (name === "clamp" || name === "wrap" || name === "reflect") {
    if (args.length !== 3) {
      throw new Error(
        `Function ${name}() requires exactly 3 arguments: ${name}(value, min, max)`,
      );
    }

    const evalArg = (i: number): number =>
      evaluateExpression(
        args[i] as ExpressionNode,
        position,
        timeSigNumerator,
        timeSigDenominator,
        timeRange,
        noteProperties,
      );

    const value = evalArg(0);
    const bound1 = evalArg(1);
    const bound2 = evalArg(2);

    if (name === "clamp") {
      return Math.min(
        Math.max(value, Math.min(bound1, bound2)),
        Math.max(bound1, bound2),
      );
    }

    const lo = Math.min(bound1, bound2);
    const hi = Math.max(bound1, bound2);

    if (lo === hi) {
      return lo;
    }

    if (name === "wrap") {
      // wrap: closed range [lo, hi] with range size hi - lo + 1
      const range = hi - lo + 1;

      return ((((value - lo) % range) + range) % range) + lo;
    }

    // reflect: ping-pong within [lo, hi]
    const period = 2 * (hi - lo);
    const wrapped = (((value - lo) % period) + period) % period;

    return wrapped <= hi - lo ? wrapped + lo : period - wrapped + lo;
  }

  if (args.length !== 1) {
    throw new Error(
      `Function ${name}() requires exactly 1 argument: ${name}(value)`,
    );
  }

  const value = evaluateExpression(
    args[0] as ExpressionNode,
    position,
    timeSigNumerator,
    timeSigDenominator,
    timeRange,
    noteProperties,
  );

  switch (name) {
    case "round":
      return Math.round(value);
    case "floor":
      return Math.floor(value);
    case "ceil":
      return Math.ceil(value);
    case "abs":
      return Math.abs(value);
    default:
      throw new Error(`Unknown math function: ${name}()`);
  }
}

// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import * as console from "#src/shared/v8-max-console.ts";
import { type ExpressionNode } from "../parser/transform-parser.ts";
import { type EvaluateExpressionFn } from "../transform-functions.ts";
import * as waveforms from "../transform-waveforms.ts";
import {
  type TimeRange,
  type NoteProperties,
} from "./transform-evaluator-helpers.ts";

/**
 * Evaluate multiple arguments by index, returning results as a tuple.
 * @param args - All function arguments
 * @param indices - Which argument indices to evaluate
 * @param position - Note position in beats
 * @param timeSigNumerator - Time signature numerator
 * @param timeSigDenominator - Time signature denominator
 * @param timeRange - Active time range
 * @param noteProperties - Note properties for variable access
 * @param evaluateExpression - Expression evaluator function
 * @returns Tuple of evaluated values in the same order as indices
 */
export function evaluateArgs<T extends number[]>(
  args: ExpressionNode[],
  indices: [...T],
  position: number,
  timeSigNumerator: number,
  timeSigDenominator: number,
  timeRange: TimeRange,
  noteProperties: NoteProperties,
  evaluateExpression: EvaluateExpressionFn,
): { [K in keyof T]: number } {
  // Cast is safe: map preserves array length, matching the input tuple
  return indices.map((i) =>
    evaluateExpression(
      args[i] as ExpressionNode,
      position,
      timeSigNumerator,
      timeSigDenominator,
      timeRange,
      noteProperties,
    ),
  ) as { [K in keyof T]: number };
}

/**
 * Calculate normalized phase from position within a time range.
 * @param position - Current position in beats
 * @param timeRange - Active time range
 * @returns Phase value between 0 and 1
 */
export function computePhase(position: number, timeRange: TimeRange): number {
  const duration = timeRange.end - timeRange.start;

  return duration > 0 ? (position - timeRange.start) / duration : 0;
}

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
 * Build an indexed-sequence evaluator (shared body for seq() and clipseq()).
 * Picks values from args by a primary axis key, with an optional fallback axis.
 * seq() passes a clip-axis fallback: a clip-granular property (gain, pitchShift)
 * has no note.index, and the clip axis is then the only meaningful one, so seq()
 * cycles by clip.index there (equivalent to clipseq() for those properties).
 * Note properties always carry note.index, so the fallback only ever bites
 * clip-granular ones. clipseq() has no fallback — forcing the clip axis onto a
 * note property must not silently borrow note.index. When no axis is in scope,
 * warns and returns the first value.
 * @param fnName - Function name for errors/warnings
 * @param axisKey - Primary NoteProperties key supplying the cycle index
 * @param missingWarning - Warning emitted when no usable axis is in scope
 * @param fallbackKey - Optional secondary axis key tried when the primary is absent
 * @returns Evaluator with the standard transform-function signature
 */
function buildIndexedSeq(
  fnName: string,
  axisKey: string,
  missingWarning: string,
  fallbackKey?: string,
): typeof evaluateRand {
  return function evaluate(
    args,
    position,
    timeSigNumerator,
    timeSigDenominator,
    timeRange,
    noteProperties,
    evaluateExpression,
  ) {
    if (args.length === 0) {
      throw new Error(`Function ${fnName}() requires at least 1 argument`);
    }

    const rawIndex =
      noteProperties[axisKey] ??
      (fallbackKey != null ? noteProperties[fallbackKey] : undefined);
    const missing = rawIndex == null;

    if (missing) {
      console.warn(missingWarning);
    }

    const pick = missing ? 0 : rawIndex % args.length;

    return evaluateExpression(
      args[pick] as ExpressionNode,
      position,
      timeSigNumerator,
      timeSigDenominator,
      timeRange,
      noteProperties,
    );
  };
}

/**
 * seq(a, b, ...) — cycle by note.index for note properties. Clip-granular
 * properties (gain, pitchShift) have no note.index, so it falls back to the
 * clip axis there (== clipseq() for those).
 */
export const evaluateSeq = buildIndexedSeq(
  "seq",
  "index",
  "seq() needs note.index or clip.index. Returning first value.",
  "clip:index",
);

/** clipseq(a, b, ...) — cycle by clip.index (per-clip across the batch). */
export const evaluateClipSeq = buildIndexedSeq(
  "clipseq",
  "clip:index",
  "clipseq() needs clip.index — did you mean seq()? Returning first value.",
);

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

    if (lo === hi) return lo;

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

  if (args.length === 0) {
    throw new Error(`Function ${name}() requires one argument`);
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

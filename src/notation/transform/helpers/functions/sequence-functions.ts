// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import * as console from "../../transform-warning-label.ts";
import { type ExpressionNode } from "../../parser/transform-parser.ts";
import { type EvaluateExpressionFn } from "../../transform-functions.ts";
import * as waveforms from "../../transform-waveforms.ts";
import { type NoteProperties, type TimeRange } from "../transform-context.ts";

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

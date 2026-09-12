// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { type ExpressionNode } from "../../parser/transform-parser.ts";
import { type EvaluateExpressionFn } from "../../transform-functions.ts";
import { type NoteProperties, type TimeRange } from "../transform-context.ts";

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

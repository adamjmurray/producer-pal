// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { type ExpressionNode } from "../parser/transform-parser.ts";
import { type PeriodObject } from "../transform-frequency.ts";
import {
  type EvaluateExpressionFn,
  parsePeriod,
} from "../transform-functions.ts";
import {
  type TimeRange,
  type NoteProperties,
} from "./transform-evaluator-helpers.ts";

/**
 * Evaluate swing function (delay off-beat notes for swing feel).
 * Returns absolute position — use with `timing =`.
 * @param args - Function arguments (1-2: amount, optional period)
 * @param position - Note position in musical beats
 * @param timeSigNumerator - Time signature numerator
 * @param timeSigDenominator - Time signature denominator
 * @param timeRange - Active time range
 * @param noteProperties - Note properties for variable access
 * @param evaluateExpression - Expression evaluator function
 * @returns Absolute position with swing applied
 */
export function evaluateSwing(
  args: ExpressionNode[],
  position: number,
  timeSigNumerator: number,
  timeSigDenominator: number,
  timeRange: TimeRange,
  noteProperties: NoteProperties,
  evaluateExpression: EvaluateExpressionFn,
): number {
  if (args.length === 0 || args.length > 2) {
    throw new Error(
      `Function swing() requires 1-2 arguments: swing(amount [, period])`,
    );
  }

  const amount = evaluateExpression(
    args[0] as ExpressionNode,
    position,
    timeSigNumerator,
    timeSigDenominator,
    timeRange,
    noteProperties,
  );

  // Default period is 1 beat (8th-note swing)
  let period = 1.0;

  if (args.length === 2) {
    period = parsePeriod(
      args[1] as ExpressionNode | PeriodObject,
      position,
      timeSigNumerator,
      timeSigDenominator,
      timeRange,
      noteProperties,
      evaluateExpression,
      "swing",
    );
  }

  // Phase within the period cycle (0-1)
  const phase = (position / period) % 1.0;

  // On-beat (first half): no offset. Off-beat (second half): full offset.
  const offset = phase < 0.5 ? 0 : amount;

  return position + offset;
}

/**
 * Evaluate quant function (snap timing to nearest grid point).
 * Returns absolute position — use with `timing =`.
 * @param args - Function arguments (exactly 1: grid size)
 * @param position - Note position in musical beats
 * @param timeSigNumerator - Time signature numerator
 * @param timeSigDenominator - Time signature denominator
 * @param timeRange - Active time range
 * @param noteProperties - Note properties for variable access
 * @param evaluateExpression - Expression evaluator function
 * @returns Position snapped to nearest grid point
 */
export function evaluateQuant(
  args: ExpressionNode[],
  position: number,
  timeSigNumerator: number,
  timeSigDenominator: number,
  timeRange: TimeRange,
  noteProperties: NoteProperties,
  evaluateExpression: EvaluateExpressionFn,
): number {
  if (args.length !== 1) {
    throw new Error(
      `Function quant() requires exactly 1 argument: quant(grid)`,
    );
  }

  const grid = parsePeriod(
    args[0] as ExpressionNode | PeriodObject,
    position,
    timeSigNumerator,
    timeSigDenominator,
    timeRange,
    noteProperties,
    evaluateExpression,
    "quant",
  );

  return Math.round(position / grid) * grid;
}

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
 * @param args - Function arguments (1-2: amount, optional grid)
 * @param raw - If true, skip auto-quantize
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
  raw: boolean,
  position: number,
  timeSigNumerator: number,
  timeSigDenominator: number,
  timeRange: TimeRange,
  noteProperties: NoteProperties,
  evaluateExpression: EvaluateExpressionFn,
): number {
  if (args.length === 0 || args.length > 2) {
    throw new Error(
      `Function swing() requires 1-2 arguments: swing(amount [, grid])`,
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

  // Default grid is 0.5 beats (8th-note swing, same as quant(1/2t))
  let grid = 0.5;

  if (args.length === 2) {
    grid = parsePeriod(
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

  const period = grid * 2;

  // Auto-quantize: snap to grid/4 before applying swing (unless raw).
  // Uses grid/4 (not grid) to preserve notes at finer subdivisions
  // (e.g. 16th notes during 8th-note swing).
  let effectivePosition = position;

  if (!raw) {
    const quantGrid = grid / 4;

    effectivePosition = Math.round(position / quantGrid) * quantGrid;
  }

  // Phase within the period cycle (0-1)
  const phase = (effectivePosition / period) % 1.0;

  // On-beat (first half): no offset. Off-beat (second half): full offset.
  const offset = phase < 0.5 ? 0 : amount;

  return effectivePosition + offset;
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

/**
 * Evaluate the legato() function with optional tolerance.
 * Scans forward through filtered start times to find the next distinct position,
 * treating starts within tolerance as the same chord. Falls back to clip end
 * for the last note.
 * @param args - Function arguments (0 or 1: optional tolerance in beats)
 * @param position - Current note position
 * @param timeSigNumerator - Time signature numerator
 * @param timeSigDenominator - Time signature denominator
 * @param timeRange - Active time range
 * @param noteProperties - Note properties including _legatoContext
 * @param evaluateExpression - Expression evaluator function
 * @returns Duration to next distinct start time
 */
export function evaluateLegato(
  args: ExpressionNode[],
  position: number,
  timeSigNumerator: number,
  timeSigDenominator: number,
  timeRange: TimeRange,
  noteProperties: NoteProperties,
  evaluateExpression: EvaluateExpressionFn,
): number {
  if (args.length > 1) {
    throw new Error("legato() accepts at most 1 argument (tolerance)");
  }

  const ctx = noteProperties._legatoContext;

  if (!ctx) {
    throw new Error("legato(): not available in this context");
  }

  const tolerance =
    args.length === 1
      ? evaluateExpression(
          args[0] as ExpressionNode,
          position,
          timeSigNumerator,
          timeSigDenominator,
          timeRange,
          noteProperties,
        )
      : 0;

  const noteStart = ctx.starts[ctx.cursor] as number;

  // Scan forward for next start beyond tolerance
  for (let k = ctx.cursor + 1; k < ctx.starts.length; k++) {
    if (Math.abs((ctx.starts[k] as number) - noteStart) > tolerance) {
      return (ctx.starts[k] as number) - noteStart;
    }
  }

  // Last note — extend to clip end
  if (ctx.clipEnd != null) {
    return ctx.clipEnd - noteStart;
  }

  throw new Error("legato(): no next note available");
}

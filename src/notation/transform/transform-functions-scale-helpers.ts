// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { quantizePitchToScale, stepInScale } from "#src/shared/pitch.ts";
import { type ExpressionNode } from "./parser/transform-parser.ts";
import {
  type TimeRange,
  type NoteProperties,
} from "./transform-evaluator-helpers.ts";
import { type EvaluateExpressionFn } from "./transform-functions.ts";

/**
 * Evaluate quant function (quantize pitch to nearest in-scale pitch)
 * @param args - Function arguments (exactly 1: pitch value)
 * @param position - Note position in beats
 * @param timeSigNumerator - Time signature numerator
 * @param timeSigDenominator - Time signature denominator
 * @param timeRange - Active time range
 * @param noteProperties - Note properties for variable access (includes scale:mask)
 * @param evaluateExpression - Expression evaluator function
 * @returns Quantized pitch value, or input unchanged if no scale
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
      `Function quant() requires exactly 1 argument: quant(pitch)`,
    );
  }

  const pitch = evaluateExpression(
    args[0] as ExpressionNode,
    position,
    timeSigNumerator,
    timeSigDenominator,
    timeRange,
    noteProperties,
  );

  const scaleMask = noteProperties["scale:mask"];

  if (scaleMask == null) return pitch;

  return quantizePitchToScale(pitch, scaleMask);
}

/**
 * Evaluate step function (move pitch by N scale steps)
 * @param args - Function arguments (exactly 2: basePitch, offset)
 * @param position - Note position in beats
 * @param timeSigNumerator - Time signature numerator
 * @param timeSigDenominator - Time signature denominator
 * @param timeRange - Active time range
 * @param noteProperties - Note properties for variable access (includes scale:mask)
 * @param evaluateExpression - Expression evaluator function
 * @returns Pitch moved by offset scale steps, or basePitch + offset if no scale
 */
export function evaluateStep(
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
      `Function step() requires exactly 2 arguments: step(basePitch, offset)`,
    );
  }

  const basePitch = evaluateExpression(
    args[0] as ExpressionNode,
    position,
    timeSigNumerator,
    timeSigDenominator,
    timeRange,
    noteProperties,
  );
  const offset = evaluateExpression(
    args[1] as ExpressionNode,
    position,
    timeSigNumerator,
    timeSigDenominator,
    timeRange,
    noteProperties,
  );
  const scaleMask = noteProperties["scale:mask"];

  if (scaleMask == null) return basePitch + offset;

  return stepInScale(basePitch, offset, scaleMask);
}

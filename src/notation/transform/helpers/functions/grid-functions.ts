// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { quantizePitchToScale, stepInScale } from "#src/shared/pitch.ts";
import { type ExpressionNode } from "../../parser/transform-parser.ts";
import { type EvalContext } from "../transform-context.ts";

/**
 * Evaluate snap function (snap pitch to nearest in-scale pitch)
 * @param args - Function arguments (exactly 1: pitch value)
 * @param ctx - Evaluation context (noteProperties includes scale:mask)
 * @returns Quantized pitch value, or input unchanged if no scale
 */
export function evaluateSnap(args: ExpressionNode[], ctx: EvalContext): number {
  if (args.length !== 1) {
    throw new Error(`Function snap() requires exactly 1 argument: snap(pitch)`);
  }

  const pitch = ctx.evaluateExpression(args[0] as ExpressionNode, ctx);
  const scaleMask = ctx.noteProperties["scale:mask"];

  if (scaleMask == null) {
    return pitch;
  }

  return quantizePitchToScale(pitch, scaleMask);
}

/**
 * Evaluate step function (move pitch by N scale steps)
 * @param args - Function arguments (exactly 2: basePitch, offset)
 * @param ctx - Evaluation context (noteProperties includes scale:mask)
 * @returns Pitch moved by offset scale steps, or basePitch + offset if no scale
 */
export function evaluateStep(args: ExpressionNode[], ctx: EvalContext): number {
  if (args.length !== 2) {
    throw new Error(
      `Function step() requires exactly 2 arguments: step(basePitch, offset)`,
    );
  }

  const basePitch = ctx.evaluateExpression(args[0] as ExpressionNode, ctx);
  const offset = ctx.evaluateExpression(args[1] as ExpressionNode, ctx);
  const scaleMask = ctx.noteProperties["scale:mask"];

  if (scaleMask == null) {
    return basePitch + offset;
  }

  return stepInScale(basePitch, offset, scaleMask);
}

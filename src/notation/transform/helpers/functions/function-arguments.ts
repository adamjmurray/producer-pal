// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { type ExpressionNode } from "../../parser/transform-parser.ts";
import { type EvalContext } from "../transform-context.ts";

/**
 * Evaluate multiple arguments by index, returning results as a tuple.
 * @param args - All function arguments
 * @param indices - Which argument indices to evaluate
 * @param ctx - Evaluation context
 * @returns Tuple of evaluated values in the same order as indices
 */
export function evaluateArgs<T extends number[]>(
  args: ExpressionNode[],
  indices: [...T],
  ctx: EvalContext,
): { [K in keyof T]: number } {
  // Cast is safe: map preserves array length, matching the input tuple
  return indices.map((i) =>
    ctx.evaluateExpression(args[i] as ExpressionNode, ctx),
  ) as { [K in keyof T]: number };
}

/**
 * Calculate normalized phase from the context's position within its time range.
 * @param ctx - Evaluation context
 * @returns Phase value between 0 and 1
 */
export function computePhase(ctx: EvalContext): number {
  const { start, end } = ctx.timeRange;
  const duration = end - start;

  return duration > 0 ? (ctx.position - start) / duration : 0;
}

// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { type ExpressionNode } from "../../parser/transform-parser.ts";
import * as waveforms from "../../transform-waveforms.ts";
import { type EvalContext } from "../transform-context.ts";
import { computePhase, evaluateArgs } from "./function-arguments.ts";

/**
 * Evaluate curve function
 * @param args - Function arguments (exactly 3: start, end, exponent)
 * @param ctx - Evaluation context
 * @returns Exponentially interpolated value
 */
export function evaluateCurve(
  args: ExpressionNode[],
  ctx: EvalContext,
): number {
  if (args.length !== 3) {
    throw new Error(
      `Function curve() requires exactly 3 arguments: curve(start, end, exponent)`,
    );
  }

  const [start, end, exponent] = evaluateArgs(args, [0, 1, 2], ctx);

  if (exponent <= 0) {
    throw new Error(`Function curve() exponent must be > 0, got ${exponent}`);
  }

  return waveforms.curve(computePhase(ctx), start, end, exponent);
}

/**
 * Evaluate pow function (exactly 2 arguments: base, exponent)
 * @param args - Function arguments
 * @param ctx - Evaluation context
 * @returns base raised to the power of exponent
 */
export function evaluatePow(args: ExpressionNode[], ctx: EvalContext): number {
  if (args.length !== 2) {
    throw new Error(
      `Function pow() requires exactly 2 arguments: pow(base, exponent)`,
    );
  }

  const [base, exponent] = evaluateArgs(args, [0, 1], ctx);
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
 * @param ctx - Evaluation context
 * @returns Min or max of all arguments
 */
export function evaluateMinMax(
  name: string,
  args: ExpressionNode[],
  ctx: EvalContext,
): number {
  if (args.length < 2) {
    throw new Error(`Function ${name}() requires at least 2 arguments`);
  }

  const values = args.map((arg) => ctx.evaluateExpression(arg, ctx));

  return name === "min" ? Math.min(...values) : Math.max(...values);
}

/**
 * Evaluate math function (round, floor, ceil, abs, clamp, wrap, reflect)
 * @param name - Function name
 * @param args - Function arguments
 * @param ctx - Evaluation context
 * @returns Math function result
 */
export function evaluateMathFunction(
  name: string,
  args: ExpressionNode[],
  ctx: EvalContext,
): number {
  if (name === "clamp" || name === "wrap" || name === "reflect") {
    if (args.length !== 3) {
      throw new Error(
        `Function ${name}() requires exactly 3 arguments: ${name}(value, min, max)`,
      );
    }

    const [value, bound1, bound2] = evaluateArgs(args, [0, 1, 2], ctx);

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

  const value = ctx.evaluateExpression(args[0] as ExpressionNode, ctx);

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

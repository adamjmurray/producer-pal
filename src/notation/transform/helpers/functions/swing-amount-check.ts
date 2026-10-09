// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { type ExpressionNode } from "../../parser/transform-parser.ts";
import {
  evaluateNumericArg,
  isConstantExpression,
} from "../note-ops/numeric-op-arg.ts";
import { MeterDependentArgError } from "../note-ops/transform-arg-errors.ts";
import { DEFAULT_SWING_GRID, swingAmountError } from "./swing-amount.ts";

/**
 * Throw for a `swing()` call, anywhere in the expression, whose constant amount
 * is at or past its constant grid. A call with a variable or random amount or
 * grid is checked by swing() itself as it runs. When the amount and
 * grid are plain numbers the mistake holds in every meter; a note value like
 * `n/8` is a different number of beats in another meter, so it only fails the
 * clip.
 * @param node - The expression to search
 * @param numerator - Time signature numerator
 * @param denominator - Time signature denominator
 * @param isAudio - Whether the transform will run on audio clips
 * @throws Error naming the limit (MeterDependentArgError when it depends on the
 *   meter)
 */
export function checkSwingAmounts(
  node: ExpressionNode,
  numerator: number,
  denominator: number,
  isAudio: boolean,
): void {
  if (typeof node !== "object") {
    return;
  }

  if (node.type === "function") {
    if (node.name === "swing") {
      checkSwingCall(node.args, numerator, denominator, isAudio);
    }

    for (const arg of node.args) {
      checkSwingAmounts(arg, numerator, denominator, isAudio);
    }
  } else if ("left" in node) {
    checkSwingAmounts(node.left, numerator, denominator, isAudio);
    checkSwingAmounts(node.right, numerator, denominator, isAudio);
  }
}

function checkSwingCall(
  args: ExpressionNode[],
  numerator: number,
  denominator: number,
  isAudio: boolean,
): void {
  const [amountArg, gridArg] = args;
  const written = [amountArg, gridArg].filter((arg) => arg != null);

  if (
    amountArg == null ||
    !written.every((arg) => isConstantExpression(arg, !isAudio))
  ) {
    return;
  }

  const amount = evaluateNumericArg(amountArg, numerator, denominator);
  const grid =
    gridArg == null
      ? { value: DEFAULT_SWING_GRID }
      : evaluateNumericArg(gridArg, numerator, denominator);

  // A grid of 0 or less is swing()'s own error, raised as it runs.
  if (!("value" in amount) || !("value" in grid) || grid.value <= 0) {
    return;
  }

  const message = swingAmountError(amount.value, grid.value);

  if (message == null) {
    return;
  }

  throw written.every((arg) => isConstantExpression(arg, false))
    ? new Error(message)
    : new MeterDependentArgError(message);
}

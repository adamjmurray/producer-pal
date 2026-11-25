// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { type ExpressionNode } from "../../parser/transform-parser.ts";
import {
  argError,
  evaluateNumericArg,
  isConstantExpression,
} from "../note-ops/numeric-op-arg.ts";

/**
 * Throw for a `swing()` or `quant()` call, anywhere in the expression, whose
 * constant grid can't be evaluated, isn't finite or is 0 or below. A grid that
 * uses a variable or a random function is checked by the function as it runs.
 * A lone note value (`-n/8`, `0 * n/8`) is bad in every meter; a grid that mixes
 * note values with other terms is judged in this meter only (see `argError`).
 * @param node - The expression to search
 * @param numerator - Time signature numerator
 * @param denominator - Time signature denominator
 * @param isAudio - Whether the transform will run on audio clips
 * @throws Error naming the function (MeterDependentArgError when it depends on
 *   the meter)
 */
export function checkTimingGrids(
  node: ExpressionNode,
  numerator: number,
  denominator: number,
  isAudio: boolean,
): void {
  if (typeof node !== "object") {
    return;
  }

  if (node.type === "function") {
    const gridArg =
      node.name === "swing"
        ? node.args[1]
        : node.name === "quant"
          ? node.args[0]
          : undefined;

    if (gridArg != null && isConstantExpression(gridArg, !isAudio)) {
      checkGrid(gridArg, node.name, numerator, denominator);
    }

    for (const arg of node.args) {
      checkTimingGrids(arg, numerator, denominator, isAudio);
    }
  } else if ("left" in node) {
    checkTimingGrids(node.left, numerator, denominator, isAudio);
    checkTimingGrids(node.right, numerator, denominator, isAudio);
  }
}

function checkGrid(
  gridArg: ExpressionNode,
  name: string,
  numerator: number,
  denominator: number,
): void {
  const grid = evaluateNumericArg(gridArg, numerator, denominator);

  if ("problem" in grid) {
    throw argError(gridArg, `${name}() grid ${grid.problem}`);
  }

  if (grid.value <= 0) {
    throw argError(gridArg, `${name}() grid must be greater than 0`);
  }
}

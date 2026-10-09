// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import {
  type ExpressionNode,
  type TransformAssignment,
} from "../../parser/transform-parser.ts";

// Functions that return the note's new start, not an amount to add to it.
const POSITION_FUNCTIONS = new Set(["swing", "quant"]);

/**
 * Throw when a compound assignment (`+=`, `-=`, `*=`, `/=`) takes a `swing()`
 * or `quant()` call directly. They return a position, so `timing += swing(...)`
 * adds the note's own start to its swung start and slides the note later (out
 * of the clip). Only a top-level call is checked.
 * @param assignment - A parsed assignment
 * @throws Error naming the function and the fix
 */
export function checkPositionFunctionAssignment(
  assignment: TransformAssignment,
): void {
  const { compound, expression, parameter } = assignment;
  const value =
    compound == null ? undefined : writtenValue(expression, compound);

  if (
    typeof value === "object" &&
    value.type === "function" &&
    POSITION_FUNCTIONS.has(value.name)
  ) {
    throw new Error(
      `${value.name}() returns the new start, so use "${parameter} = ${value.name}(...)", not "${parameter} ${compound}"`,
    );
  }
}

// The parser desugars `-=` to `+= 0 - x` and `*=` / `/=` to `= current * x`;
// this returns the `x` the model wrote.
function writtenValue(
  expression: ExpressionNode,
  compound: string,
): ExpressionNode | undefined {
  if (compound === "+=") {
    return expression;
  }

  return typeof expression === "object" && "right" in expression
    ? expression.right
    : undefined;
}

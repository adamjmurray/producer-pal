// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/** Finding a named function call inside a transform expression. */

import { type ExpressionNode } from "../parser/transform-parser.ts";

/**
 * Find the first call to one of `names` anywhere in an expression.
 * @param expr - Expression to walk
 * @param names - Function names to look for
 * @returns The name found, or null when the expression has none of them
 */
export function findFunctionName(
  expr: ExpressionNode,
  names: ReadonlySet<string>,
): string | null {
  if (typeof expr === "number" || !("type" in expr)) {
    return null;
  }

  if (expr.type === "function") {
    if (names.has(expr.name)) {
      return expr.name;
    }

    for (const arg of expr.args) {
      const nested = findFunctionName(arg, names);

      if (nested != null) {
        return nested;
      }
    }

    return null;
  }

  // Binary nodes carry the OPERATOR as their type ("add", "multiply", ...),
  // so match on shape rather than listing every operator.
  if ("left" in expr && "right" in expr) {
    return (
      findFunctionName(expr.left, names) ?? findFunctionName(expr.right, names)
    );
  }

  return null;
}

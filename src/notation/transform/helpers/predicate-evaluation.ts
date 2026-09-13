// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { type PredicateNode } from "../parser/transform-parser.ts";
import { type EvalContext } from "./transform-context.ts";
import { SELECTOR_EPSILON } from "./transform-selector-epsilon.ts";

/**
 * Evaluate a where() predicate to a boolean for one note. Boolean/comparison nodes
 * resolve here; comparison operands bottom out in the injected evaluateExpression
 * (the same arithmetic the parser restricted to note properties + literals).
 * Comparisons carry SELECTOR_EPSILON (see compareValues) so float drift in note
 * positions/durations can't drop a note that names a boundary — the same tolerance
 * the time/pitch selectors use.
 * @param node - Predicate AST node
 * @param ctx - Per-note evaluation context
 * @returns Whether the note satisfies the predicate
 */
export function evaluatePredicate(
  node: PredicateNode,
  ctx: EvalContext,
): boolean {
  switch (node.type) {
    case "or":
      return (
        evaluatePredicate(node.left, ctx) || evaluatePredicate(node.right, ctx)
      );
    case "and":
      return (
        evaluatePredicate(node.left, ctx) && evaluatePredicate(node.right, ctx)
      );
    case "not":
      return !evaluatePredicate(node.operand, ctx);

    case "comparison":
      return compareValues(
        node.op,
        ctx.evaluateExpression(node.left, ctx),
        ctx.evaluateExpression(node.right, ctx),
      );

    // Unreachable: every node type is handled above, and the `never` keeps it
    // that way if a new one is added.
    default: {
      const exhaustive: never = node;

      return exhaustive;
    }
  }
}

/**
 * Apply a comparison operator to two evaluated operands, carrying SELECTOR_EPSILON
 * so ULP-level float drift can't flip a comparison against a value that names a
 * boundary (e.g. a ratcheted note.start a hair below the beat an n/8 literal names).
 * Inclusive operators widen by ε so a boundary value is never missed (`>=` accepts
 * down to `right - ε`, `<=` accepts up to `right + ε`); strict operators narrow by
 * ε so a boundary value is never spuriously admitted (`>` requires `left > right + ε`,
 * `<` requires `left < right - ε`). Equality compares within ε. 1e-9 sits far below
 * any musical distance, so genuinely distinct values (velocity steps of 1, etc.) are
 * never bridged.
 * @param op - Comparison operator
 * @param left - Left operand value
 * @param right - Right operand value
 * @returns Result of the comparison
 */
function compareValues(
  op: ">" | ">=" | "<" | "<=" | "==" | "!=",
  left: number,
  right: number,
): boolean {
  switch (op) {
    case ">":
      return left > right + SELECTOR_EPSILON;
    case ">=":
      return left >= right - SELECTOR_EPSILON;
    case "<":
      return left < right - SELECTOR_EPSILON;
    case "<=":
      return left <= right + SELECTOR_EPSILON;
    case "==":
      return Math.abs(left - right) <= SELECTOR_EPSILON;
    case "!=":
      return Math.abs(left - right) > SELECTOR_EPSILON;

    // Unreachable: every operator is handled above, and the `never` keeps it
    // that way if a new one is added.
    default: {
      const exhaustive: never = op;

      return exhaustive;
    }
  }
}

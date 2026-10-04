// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { errorMessage } from "#src/shared/error-message.ts";
import * as console from "../../transform-warning-label.ts";
import { type ExpressionNode } from "../../parser/transform-parser.ts";
import {
  constantEvalContext,
  evaluateExpression,
} from "../transform-evaluation.ts";
import { MeterDependentArgError } from "./transform-arg-errors.ts";

// Functions whose value depends only on their arguments. Anything else (rand,
// choose, seq, the waveforms, ...) can differ per call, so its argument can't be
// judged before the notes are.
const PURE_FUNCTIONS = new Set([
  "round",
  "floor",
  "ceil",
  "abs",
  "clamp",
  "wrap",
  "reflect",
  "min",
  "max",
  "pow",
]);

/**
 * Whether a note value or bar duration, which is the grid or offset form of a
 * note op's argument.
 * @param arg - A note op argument
 * @returns True for `n/8`, `1bar` and the like
 */
export function isDurationNode(arg: ExpressionNode): boolean {
  return (
    typeof arg === "object" &&
    (arg.type === "nDuration" || arg.type === "barDuration")
  );
}

/**
 * Whether an expression has the same value wherever it is evaluated: no note or
 * clip variables, no random or position-driven functions. Durations count only
 * when the meter is known, as the bar length and note values depend on it.
 * @param node - The expression
 * @param meterKnown - Whether the evaluation will use the clips' real meter
 * @returns True when it can be evaluated once, up front
 */
export function isConstantExpression(
  node: ExpressionNode,
  meterKnown: boolean,
): boolean {
  if (typeof node === "number") {
    return true;
  }

  switch (node.type) {
    case "pitchLiteral":
      return true;

    case "nDuration":
    case "barDuration":
      return meterKnown;

    case "variable":
      return false;

    case "function":
      return (
        PURE_FUNCTIONS.has(node.name) &&
        node.args.every((arg) => isConstantExpression(arg, meterKnown))
      );

    default:
      return (
        isConstantExpression(node.left, meterKnown) &&
        isConstantExpression(node.right, meterKnown)
      );
  }
}

/**
 * The error for a bad constant argument: meter-dependent when its value mixes
 * note values or bar lengths with other terms, since another meter gives another
 * number. A single duration, negated or scaled by a constant, is positive times
 * the constant in any meter, so one at 0 or below is bad everywhere.
 * @param arg - The constant argument that is bad
 * @param message - What is wrong with it
 * @returns The error to throw
 */
export function argError(arg: ExpressionNode, message: string): Error {
  return isMeterIndependent(arg)
    ? new Error(message)
    : new MeterDependentArgError(message);
}

function isMeterIndependent(arg: ExpressionNode): boolean {
  if (isDurationNode(arg) || isConstantExpression(arg, false)) {
    return true;
  }

  if (!isScaledDuration(arg)) {
    return false;
  }

  const result = evaluateNumericArg(arg, 4, 4);

  return "value" in result && result.value <= 0;
}

// One duration, negated (`-n/8` is `0 - n/8`) or multiplied or divided by a
// constant: no other duration, no added terms.
function isScaledDuration(node: ExpressionNode): boolean {
  if (typeof node !== "object") {
    return false;
  }

  if (isDurationNode(node)) {
    return true;
  }

  switch (node.type) {
    case "subtract":
      return node.left === 0 && isScaledDuration(node.right);

    case "multiply":
      return (
        (isScaledDuration(node.left) &&
          isConstantExpression(node.right, false)) ||
        (isConstantExpression(node.left, false) && isScaledDuration(node.right))
      );

    case "divide":
      return (
        isScaledDuration(node.left) && isConstantExpression(node.right, false)
      );

    default:
      return false;
  }
}

/** A note op's numeric argument, evaluated: its value, or why it has none. */
export type NumericArg = { value: number } | { problem: string };

/**
 * Evaluate a note op's numeric argument with no note in scope.
 * @param arg - The (already-parsed) argument node
 * @param numerator - Time signature numerator
 * @param denominator - Time signature denominator
 * @returns The value, or what is wrong with the argument
 */
export function evaluateNumericArg(
  arg: ExpressionNode,
  numerator: number,
  denominator: number,
): NumericArg {
  let value: number;

  try {
    // Args are constants (no per-note context). nDuration/barDuration evaluate
    // to musical beats; a count evaluates to a number.
    value = evaluateExpression(
      arg,
      constantEvalContext(numerator, denominator),
    );
  } catch (error) {
    return { problem: `could not be evaluated (${errorMessage(error)})` };
  }

  // evaluateExpression only throws on non-finite for pow(); plain arithmetic
  // can still overflow to ±Infinity or yield NaN, so guard here too.
  if (!Number.isFinite(value)) {
    return { problem: "must be a finite number" };
  }

  return { value };
}

/**
 * Resolve a note op's numeric argument at run time, warning and returning null
 * when it isn't usable so the caller can skip the op. Only an argument the
 * up-front checks couldn't judge (it uses a variable or a random function) gets
 * here with a problem.
 * @param arg - The (already-parsed) argument node
 * @param numerator - Time signature numerator
 * @param denominator - Time signature denominator
 * @param label - What the argument is called in a warning, e.g. "repeat() copy count"
 * @returns The value, or null to skip
 */
export function numericOpArg(
  arg: ExpressionNode,
  numerator: number,
  denominator: number,
  label: string,
): number | null {
  const result = evaluateNumericArg(arg, numerator, denominator);

  if ("problem" in result) {
    console.warn(`${label} ${result.problem}; skipping`);

    return null;
  }

  return result.value;
}

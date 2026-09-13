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

/** What an op says when its numeric argument turns out not to be one. */
export interface NumericArgWarnings {
  /** Why a bare pitch name can't be this argument. */
  pitchLiteral: (name: string) => string;
  /** Why the expression couldn't be evaluated. */
  unevaluable: (reason: string) => string;
  /** Why the value isn't a usable number. */
  notFinite: string;
}

/**
 * Resolve a note op's numeric argument, warning and returning null when it
 * isn't usable so the caller can skip the op.
 * @param arg - The (already-parsed) argument node
 * @param numerator - Time signature numerator
 * @param denominator - Time signature denominator
 * @param warnings - What this op says for each way the argument can fail
 * @returns The value, or null to skip
 */
export function numericOpArg(
  arg: ExpressionNode,
  numerator: number,
  denominator: number,
  warnings: NumericArgWarnings,
): number | null {
  // A bare top-level pitch literal would silently coerce to its MIDI number. A
  // pitch literal nested in arithmetic is still resolved to a number below.
  if (typeof arg === "object" && arg.type === "pitchLiteral") {
    console.warn(warnings.pitchLiteral(arg.name));

    return null;
  }

  let value: number;

  try {
    // Args are constants (no per-note context). nDuration/barDuration evaluate
    // to musical beats; a count evaluates to a number.
    value = evaluateExpression(
      arg,
      constantEvalContext(numerator, denominator),
    );
  } catch (error) {
    console.warn(warnings.unevaluable(errorMessage(error)));

    return null;
  }

  // evaluateExpression only throws on non-finite for pow(); plain arithmetic
  // can still overflow to ±Infinity or yield NaN, so guard here too.
  if (!Number.isFinite(value)) {
    console.warn(warnings.notFinite);

    return null;
  }

  return value;
}

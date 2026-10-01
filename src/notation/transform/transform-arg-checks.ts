// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import {
  findArityError,
  type ArityNode,
} from "./helpers/functions/function-arity.ts";
import { checkNoteOpArgs } from "./helpers/note-ops/note-op-arg-checks.ts";
import {
  evaluateNumericArg,
  isConstantExpression,
} from "./helpers/note-ops/numeric-op-arg.ts";
import { isNoteOp } from "./helpers/transform-evaluation.ts";
import {
  type ExpressionNode,
  type TransformAssignment,
  type TransformStatement,
} from "./parser/transform-parser.ts";
import { AUDIO_PARAMETERS } from "./transform-clip-type.ts";

/** A mistake in the transform text that is the same for every clip. */
export class TransformArgError extends Error {
  override name = "TransformArgError";
}

/**
 * Throw for a mistake in the transform text that is the same for every clip: a
 * duplicate selector, a pitch name used as a number, a note op with the wrong
 * arguments, a `curve()` exponent that is not above 0. Callers run this as part
 * of parsing, so the whole call is refused before any clip is touched.
 *
 * What depends on a clip or a note (a variable, a random function, a clip with
 * no notes in the range) isn't judged here; it is reported per clip as the
 * transform runs.
 * @param ast - The parsed transform
 * @param numerator - Time signature numerator the transform will run in
 * @param denominator - Time signature denominator the transform will run in
 * @param clipType - Whether it will run on MIDI clips or on audio clips, which
 *   ignore the other kind's statements and read no meter
 */
export function checkTransformArgs(
  ast: TransformStatement[],
  numerator: number,
  denominator: number,
  clipType: "midi" | "audio",
): void {
  try {
    checkStatements(ast, numerator, denominator, clipType);
  } catch (error) {
    throw error instanceof TransformArgError
      ? error
      : new TransformArgError((error as Error).message);
  }
}

// The checks themselves; checkTransformArgs tags whatever they throw.
function checkStatements(
  ast: TransformStatement[],
  numerator: number,
  denominator: number,
  clipType: "midi" | "audio",
): void {
  const isAudio = clipType === "audio";

  for (const stmt of ast) {
    if (stmt.selectorError != null) {
      throw new Error(stmt.selectorError);
    }

    if (isNoteOp(stmt)) {
      if (!isAudio) {
        throwIfArityError(stmt.args);
        checkNoteOpArgs(stmt, numerator, denominator);
      }
    } else if (AUDIO_PARAMETERS.has(stmt.parameter) === isAudio) {
      checkAssignment(stmt, numerator, denominator, isAudio);
    }
  }
}

function throwIfArityError(nodes: Array<ArityNode | undefined>): void {
  for (const node of nodes) {
    const error = findArityError(node);

    if (error != null) {
      throw new Error(error);
    }
  }
}

function checkAssignment(
  assignment: TransformAssignment,
  numerator: number,
  denominator: number,
  isAudio: boolean,
): void {
  const { expression, parameter } = assignment;

  throwIfArityError([expression, assignment.predicate ?? undefined]);

  // A bare pitch name is a number only for `pitch`, and would otherwise
  // silently become its MIDI number (`velocity = b2` -> 59).
  if (
    parameter !== "pitch" &&
    typeof expression === "object" &&
    expression.type === "pitchLiteral"
  ) {
    throw new Error(
      isAudio
        ? `pitch name "${expression.name}" isn't a value for ${parameter}; audio clips have no pitch, so ${parameter} takes a number (e.g. ${parameter} = ${parameter === "gain" ? "-6" : "12"})`
        : `note name "${expression.name}" isn't a value for ${parameter}; pitch names set the pitch parameter, act as selectors (C3:), or are function arguments (e.g. min(C3,C5))`,
    );
  }

  checkCurveExponents(expression, numerator, denominator, isAudio);
}

/**
 * Throw for a `curve()` inside an expression whose exponent is a constant at or
 * below 0. A clip's meter is only known up front for MIDI clips, so an audio
 * exponent built from note values is left for run time.
 * @param node - The expression to search
 * @param numerator - Time signature numerator
 * @param denominator - Time signature denominator
 * @param isAudio - Whether the transform will run on audio clips
 */
function checkCurveExponents(
  node: ExpressionNode,
  numerator: number,
  denominator: number,
  isAudio: boolean,
): void {
  if (typeof node !== "object") {
    return;
  }

  if (node.type === "function") {
    const exponent = node.name === "curve" ? node.args[2] : undefined;

    if (exponent != null && isConstantExpression(exponent, !isAudio)) {
      const result = evaluateNumericArg(exponent, numerator, denominator);

      if ("value" in result && result.value <= 0) {
        throw new Error(`curve() exponent must be > 0, got ${result.value}`);
      }
    }

    for (const arg of node.args) {
      checkCurveExponents(arg, numerator, denominator, isAudio);
    }
  } else if ("left" in node) {
    checkCurveExponents(node.left, numerator, denominator, isAudio);
    checkCurveExponents(node.right, numerator, denominator, isAudio);
  }
}

// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import {
  type ExpressionNode,
  type NoteOp,
} from "../../parser/transform-parser.ts";
import {
  argError,
  evaluateNumericArg,
  isConstantExpression,
  isDurationNode,
} from "./numeric-op-arg.ts";

/**
 * Throw for a note op whose arguments are wrong. One that is wrong the same way
 * in every meter is a plain error; a constant that mixes note values or bar
 * lengths with other terms is judged in this meter only (see `argError`). An
 * argument that uses a variable or a random function can't be judged here and
 * is left for the op to check as it runs.
 * @param op - The parsed note op
 * @param numerator - Time signature numerator
 * @param denominator - Time signature denominator
 */
export function checkNoteOpArgs(
  op: NoteOp,
  numerator: number,
  denominator: number,
): void {
  const args = op.args as ExpressionNode[]; // all but split's bar|beat points

  switch (op.name) {
    case "ratchet":
      checkRatchet(args, numerator, denominator);
      break;

    case "repeat":
      checkRepeat(args, numerator, denominator);
      break;

    case "merge":
      checkMerge(args);
      break;

    default:
      if (op.args.length === 0) {
        throw new Error(
          "split() needs one or more bar|beat positions, e.g. split(2|1, 2|3)",
        );
      }
  }
}

// ratchet(count) or ratchet(noteValue): exactly one argument, a count of at
// least 2 or a grid above 0.
function checkRatchet(
  args: ExpressionNode[],
  numerator: number,
  denominator: number,
): void {
  const [arg] = args;

  if (arg == null) {
    throw new Error(
      "ratchet() needs a count or note value, e.g. ratchet(2) or ratchet(n/16)",
    );
  }

  if (args.length > 1) {
    throw new Error("ratchet() takes a single count or note value");
  }

  const value = constantArg(
    arg,
    "ratchet() argument",
    `ratchet() takes a count or note value, not the pitch name`,
    numerator,
    denominator,
  );

  if (value == null) {
    return;
  }

  if (isDurationNode(arg)) {
    if (value <= 0) {
      throw argError(arg, "ratchet() grid must be greater than 0");
    }
  } else if (Math.round(value) < 2) {
    throw argError(arg, "ratchet() needs a count of 2 or more");
  }
}

// repeat(offset [, copies]): the offset must be a note value or bar duration
// above 0; the copy count, when given, must round to 1 or more.
function checkRepeat(
  args: ExpressionNode[],
  numerator: number,
  denominator: number,
): void {
  const [offset, copies] = args;

  if (offset == null) {
    throw new Error(
      "repeat() needs an offset, e.g. repeat(n/8) or repeat(1bar)",
    );
  }

  if (args.length > 2) {
    throw new Error("repeat() takes an offset and an optional copy count");
  }

  if (!isDurationNode(offset)) {
    throw new Error(
      "repeat() offset must be a note value like n/8 or a bar duration like 1bar",
    );
  }

  const offsetValue = evaluateNumericArg(offset, numerator, denominator);

  if ("value" in offsetValue && offsetValue.value <= 0) {
    throw new Error("repeat() offset must be greater than 0");
  }

  if (copies == null) {
    return;
  }

  const count = constantArg(
    copies,
    "repeat() copy count",
    "repeat() takes a copy count like repeat(n/8, 3), not the pitch name",
    numerator,
    denominator,
  );

  if (count != null && Math.round(count) < 1) {
    throw argError(copies, "repeat() needs a copy count of 1 or more");
  }
}

// merge([tolerance]): the tolerance is a note value or a literal 0, nothing else.
function checkMerge(args: ExpressionNode[]): void {
  const [tolerance] = args;

  if (args.length > 1) {
    throw new Error("merge() takes a single gap tolerance");
  }

  if (
    tolerance != null &&
    tolerance !== 0 &&
    !(typeof tolerance === "object" && tolerance.type === "nDuration")
  ) {
    throw new Error(
      "merge() gap tolerance must be a note value like n/16, or 0 for touching notes",
    );
  }
}

/**
 * Evaluate a numeric argument that can be judged up front.
 * @param arg - The argument
 * @param label - What the argument is called in a message
 * @param pitchMessage - What to say for a pitch name; the name is appended
 * @param numerator - Time signature numerator
 * @param denominator - Time signature denominator
 * @returns The value, or null when it can only be known as the op runs
 */
function constantArg(
  arg: ExpressionNode,
  label: string,
  pitchMessage: string,
  numerator: number,
  denominator: number,
): number | null {
  if (typeof arg === "object" && arg.type === "pitchLiteral") {
    throw new Error(`${pitchMessage} "${arg.name}"`);
  }

  if (!isConstantExpression(arg, true)) {
    return null;
  }

  const result = evaluateNumericArg(arg, numerator, denominator);

  if ("problem" in result) {
    throw argError(arg, `${label} ${result.problem}`);
  }

  return result.value;
}

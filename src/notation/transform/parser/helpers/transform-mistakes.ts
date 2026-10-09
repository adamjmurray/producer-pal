// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import {
  isUnclosed,
  type SyntaxFailure,
  unclosedCommentHint,
  zeroDenominatorHint,
} from "#src/notation/peggy-error-formatter.ts";
import { type FailedLine, readFailedLine } from "./failed-line.ts";
import { isTransformSharp } from "./transform-comments.ts";
import {
  afterParameterMistake,
  shorthandMathMistake,
  unknownParameterMistake,
} from "./transform-assignment-mistakes.ts";
import {
  bareConditionMistake,
  unknownPropertyMistake,
  whereNameMistake,
} from "./transform-condition-mistakes.ts";

// Runs only after a parse has already failed, so a hint can never change what
// parses. Each check returns a short fix, or null when it isn't sure — the
// generic error is better than a wrong fix. Regexes here must stay linear:
// transforms have no length cap and this runs on the Max thread.
type MistakeCheck = (line: FailedLine) => string | null;

const CHECKS: MistakeCheck[] = [
  unclosedParen,
  ({ code }) => zeroDenominatorHint(code),
  mixedWildcardRange,
  unknownPropertyMistake,
  whereNameMistake,
  bareConditionMistake,
  shorthandMathMistake,
  afterParameterMistake,
  danglingOperator,
  angleConstantMistake,
  unknownParameterMistake,
];

/**
 * Name the likely mistake on a transform line that failed to parse.
 * @param failure - Where the parse stopped
 * @returns A short hint naming the fix, or null when no check is sure
 */
export function diagnoseTransformMistake(
  failure: SyntaxFailure,
): string | null {
  const comment = unclosedCommentHint(failure, isTransformSharp);

  if (comment != null) {
    return comment;
  }

  const failed = readFailedLine(failure);

  for (const check of CHECKS) {
    const hint = check(failed);

    if (hint != null) {
      return hint;
    }
  }

  return null;
}

/**
 * @param line - The failing line
 * @returns Hint for more `(` than `)`
 */
function unclosedParen(line: FailedLine): string | null {
  return isUnclosed(line.code, "(", ")")
    ? `unclosed "(" — add the missing ")".`
    : null;
}

/**
 * @param line - The failing line
 * @returns Hint for a range mixing a whole bar (`3|*`) with a beat (`4|1`)
 */
function mixedWildcardRange(line: FailedLine): string | null {
  const { code } = line;

  const match =
    /(?<!\d)(\d+)\|\*-<?(\d+)\|(?!\*)/.exec(code) ??
    /(?<!\d)(\d+)\|[\d.]+(?:[+-]n[\d./]+)?-<?(\d+)\|\*/.exec(code);

  if (match == null) {
    return null;
  }

  const [, a, b] = match;

  return `a range can't mix a whole bar (N|*) with a beat — write "${a}|*-${b}|*" for whole bars or "${a}|1-${b}|1" for beats.`;
}

/**
 * @param line - The failing line
 * @returns Hint for a line ending in a math operator, as in `velocity = 100 +`
 */
function danglingOperator(line: FailedLine): string | null {
  const { code, rest } = line;

  // The parse stops at the operator (`velocity = -`, where it can't be
  // subtraction) or just after it (`velocity = 1 +`).
  if (/^[+\-*/%]$/.test(rest)) {
    return `nothing after "${rest}" — add a value or remove it.`;
  }

  const head = code.trimEnd();
  const op = head.slice(-1);

  // `n/` is a half-written note value, not a division.
  return rest === "" &&
    head.includes("=") &&
    "+-*/%".includes(op) &&
    op !== "" &&
    !/(?<![\w.])n[\d.]*.$/.test(head)
    ? `nothing after "${op}" — add a value or remove it.`
    : null;
}

/**
 * @param line - The failing line
 * @returns Hint for a radians constant (`pi`, `tau`, `Math.PI`), which
 *   waveform arguments don't use
 */
function angleConstantMistake(line: FailedLine): string | null {
  const name = /^(?:Math\.)?(?:pi|tau)(?![\w.])/i.exec(line.rest)?.[0];

  return name == null
    ? null
    : `there is no ${name}: sin(), cos(), saw(), tri() and square() take a cycle length, not an angle — e.g. sin(1bar) or sin(n/4).`;
}

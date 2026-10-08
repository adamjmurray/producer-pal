// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { type FailedLine, fixParses } from "./failed-line.ts";
import {
  parameterAlias,
  suggestTransformName,
  TRANSFORM_PARAMETERS,
} from "./transform-vocabulary.ts";

// Hints for `parameter = value` lines. Each "write …" fix keeps the line's
// selector (without it the fix edits every note) and is checked to parse.

const ASSIGN_OP = String.raw`\*=|\/=|\+=|-=|=`;
const PARAM = TRANSFORM_PARAMETERS.join("|");
const PARAM_AT_END = new RegExp(String.raw`(?:^|[\s:])(${PARAM})\s*$`);
const PARAM_AND_OP_AT_END = new RegExp(
  String.raw`(?:^|[\s:])(${PARAM})\s*(${ASSIGN_OP})\s*$`,
);
const ASSIGNMENT_AT_START = new RegExp(
  String.raw`^([A-Za-z_][\w.]*)\s*(${ASSIGN_OP}|:)\s*(.*)$`,
);
// A lone name, then anything: `start 2|1`.
const NAME_THEN_REST = /^([A-Za-z]+)(?:\s+(.*))?$/;
// A note value or bar count.
const DURATION = String.raw`n[\d.]*\/[1-9]\d*[dt]?|n?\d+bars?`;
const DURATION_VALUE = new RegExp(`^(${DURATION})$`);
// A shorthand token that is a line's whole body: duration, velocity,
// probability, or pitch.
const SHORTHAND_AT_END = new RegExp(
  String.raw`(?:^|:)\s*(${DURATION}|v\d+|p[\d.]+|[A-Ga-g][#b♯♭]?-?\d+)\s*$`,
);
// Velocity and probability shorthands, which aren't values (`velocity = v80`
// fails), so a fix uses them alone.
const VALUE_SHORTHAND = /^(v\d+(-\d+)?|p[\d.]+)$/;
// One number, name, call or note value: `x + 5` → `x += 5` is only safe when
// no other operator follows (`x * 2 + 1` is not `x *= 2 + 1`).
const SINGLE_OPERAND = /^([\w.]+(\([^()]*\))?|n[\d.]*\/[1-9]\d*[dt]?)$/;

// A value per parameter for "write it like this" examples.
const EXAMPLE_VALUES: Record<string, string> = {
  velocity: "100",
  pitch: "C3",
  timing: "quant(n/16)",
  duration: "n/8",
  probability: "0.5",
  deviation: "20",
  gain: "-6",
  pitchShift: "12",
};

/**
 * @param line - The failing line
 * @returns Hint for arithmetic on a shorthand body, as in `1|1: n/4*0.85`
 */
export function shorthandMathMistake(line: FailedLine): string | null {
  const { before, rest } = line;

  const shorthand = SHORTHAND_AT_END.exec(before);
  const math = /^([+\-*/%])\s*(\S.*)$/.exec(rest);

  if (shorthand == null || math == null) {
    return null;
  }

  const token = shorthand[1] as string;
  const [param, value] = shorthandAssignment(token);

  return checked(
    "a shorthand can't take math",
    selectorBefore(before, shorthand, token),
    `${param} = ${value} ${math[1]} ${math[2]}`,
  );
}

/**
 * @param line - The failing line
 * @returns Hint for a parameter followed by `:`, by no operator, or by
 *   nothing: `velocity: 90`, `velocity 90`, `velocity =`
 */
export function afterParameterMistake(line: FailedLine): string | null {
  const { before, rest } = line;

  const withOp = PARAM_AND_OP_AT_END.exec(before);

  if (withOp != null && rest === "") {
    const [, param = "", op] = withOp;
    const fix = `${selectorBefore(before, withOp, param)}${param} ${op} ${EXAMPLE_VALUES[param]}`;

    return `nothing after "${param} ${op}" — add a value, e.g. "${fix.trimStart()}".`;
  }

  const match = PARAM_AT_END.exec(before);

  if (match == null) {
    return null;
  }

  const param = match[1] as string;
  const selector = selectorBefore(before, match, param);

  if (rest.startsWith(":")) {
    return checked(
      'use "=" to assign, not ":"',
      selector,
      assignment(param, rest.slice(1).trim()),
    );
  }

  const arithmetic = /^([+\-*/])\s*(\S+)$/.exec(rest);

  if (arithmetic != null && SINGLE_OPERAND.test(arithmetic[2] as string)) {
    return checked(
      `missing "=" after "${param}"`,
      selector,
      `${param} ${arithmetic[1]}= ${arithmetic[2]}`,
    );
  }

  // After a parameter, an operator or comparison means some other mistake.
  return rest === "" || /^[\w(.]/.test(rest)
    ? checked(`missing "=" after "${param}"`, selector, assignment(param, rest))
    : null;
}

/**
 * @param line - The failing line
 * @returns Hint for an assignment to a name that isn't a parameter, as in
 *   `length *= 0.5` or `v: 95`, or a known stand-in name with no operator
 *   (`start 2|1`)
 */
export function unknownParameterMistake(line: FailedLine): string | null {
  const { before, rest } = line;
  const match = ASSIGNMENT_AT_START.exec(rest);

  if (match == null) {
    return aliasWithoutOperator(line);
  }

  const [, name = "", op, value = ""] = match;

  if (TRANSFORM_PARAMETERS.includes(name)) {
    return null;
  }

  // `C: v80` is a pitch selector missing its octave. Only for a change that
  // fits a selector: `d: n/8` more likely means duration.
  if (op === ":" && /^[A-Ga-g][#b♯♭]?$/.test(name)) {
    if (/^d$/i.test(name) && DURATION_VALUE.test(value)) {
      return checked(
        `${name} isn't a parameter`,
        before,
        `duration = ${value}`,
      );
    }

    const fix = `${before}${name}3: ${value}`.trimStart();

    return VALUE_SHORTHAND.test(value) && fixParses(fix)
      ? `a pitch needs an octave, e.g. "${fix}".`
      : null;
  }

  const bare = name.replace(/^(note|audio)\./, "");
  const suggestion = TRANSFORM_PARAMETERS.includes(bare)
    ? bare
    : suggestTransformName(bare, TRANSFORM_PARAMETERS);

  // With `:`, an unknown name may be a mistyped selector, not a parameter.
  if (op === ":" && (suggestion == null || VALUE_SHORTHAND.test(value))) {
    return null;
  }

  if (suggestion == null) {
    return `${name} isn't a parameter — use one of: ${TRANSFORM_PARAMETERS.join(", ")}.`;
  }

  const fix = checked(
    `${name} isn't a parameter`,
    before,
    `${suggestion} ${op === ":" ? "=" : op} ${value}`,
  );

  // The value may be what won't parse (`start = 2|1`); the name is still wrong.
  return (
    fix ??
    (op === ":" ? null : `${name} isn't a parameter — use ${suggestion}.`)
  );
}

/**
 * @param line - The failing line
 * @returns Hint for a known stand-in name with no operator, as in `start 2|1`
 */
function aliasWithoutOperator(line: FailedLine): string | null {
  const { before, rest } = line;
  const [, name = "", value = ""] = NAME_THEN_REST.exec(rest) ?? [];
  const alias = parameterAlias(name);

  if (alias == null) {
    return null;
  }

  const fix =
    value === ""
      ? null
      : checked(`${name} isn't a parameter`, before, `${alias} = ${value}`);

  return fix ?? `${name} isn't a parameter — use ${alias}.`;
}

/**
 * @param problem - What is wrong
 * @param selector - The line's selector prefix (`C1: `), or ""
 * @param statement - The statement to write instead
 * @returns The hint naming the whole fixed line, or null when it wouldn't
 *   parse either
 */
function checked(
  problem: string,
  selector: string,
  statement: string,
): string | null {
  const fix = `${selector}${statement}`.trimStart();

  return fixParses(fix) ? `${problem} — write "${fix}".` : null;
}

/**
 * @param before - The line up to the failure
 * @param match - A match of a pattern ending at the failure
 * @param token - The statement's first token, inside the match
 * @returns Everything before that token: the selector, or ""
 */
function selectorBefore(
  before: string,
  match: RegExpExecArray,
  token: string,
): string {
  return before.slice(0, match.index + match[0].indexOf(token));
}

/**
 * @param param - Parameter name
 * @param value - Value as written (may be empty or a shorthand)
 * @returns The statement that sets it
 */
function assignment(param: string, value: string): string {
  // `velocity: v80` → `v80`; `pitch: v80` stays wrong and fails the check.
  if (VALUE_SHORTHAND.test(value) && shorthandAssignment(value)[0] === param) {
    return value;
  }

  return `${param} = ${value || EXAMPLE_VALUES[param]}`;
}

/**
 * @param token - A shorthand token (`n/4`, `2bar`, `v80`, `p0.5`, `C3`)
 * @returns The parameter it sets and its value as an expression
 */
function shorthandAssignment(token: string): [string, string] {
  if (/^v\d/.test(token)) {
    return ["velocity", token.slice(1)];
  }

  if (/^p[\d.]/.test(token)) {
    return ["probability", token.slice(1)];
  }

  return /^[A-Ga-g]/.test(token) ? ["pitch", token] : ["duration", token];
}

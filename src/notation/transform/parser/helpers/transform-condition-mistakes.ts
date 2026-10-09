// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { type FailedLine, fixParses } from "./failed-line.ts";
import {
  suggestTransformName,
  TRANSFORM_PROPERTIES,
  WHERE_PROPERTIES,
} from "./transform-vocabulary.ts";

// Hints for where() predicates and for conditions written without one.

const WHERE_NOTE_NAMES = WHERE_PROPERTIES.map((p) => p.replace("note.", ""));
const WHERE_CAN_TEST = `where() can only test ${WHERE_PROPERTIES.join(", ")}`;
const PITCH_LITERAL = /^[A-Ga-g][#b♯♭]?-?\d+$/;
// A pitch, or a note letter missing its octave (`C`): not a property name.
const PITCH_LIKE = /^[A-Ga-g][#b♯♭]?-?\d*$/;

/**
 * @param line - The failing line
 * @returns Hint for a `note.`/`clip.`/`next.`/`audio.` name that doesn't
 *   exist, or one a where() predicate can't read
 */
export function unknownPropertyMistake(line: FailedLine): string | null {
  const { code } = line;
  const spans = whereSpans(code);

  for (const match of code.matchAll(/\b(note|clip|next|audio)\.(\w+)/g)) {
    const [variable, namespace = "", name = ""] = match;

    if (isInside(spans, match.index) && !WHERE_PROPERTIES.includes(variable)) {
      return `${WHERE_CAN_TEST} — got ${variable}.`;
    }

    const names = TRANSFORM_PROPERTIES[namespace] as string[];

    if (!names.includes(name)) {
      const suggestion = suggestTransformName(name, names);
      const fix =
        suggestion == null ? "" : ` Did you mean ${namespace}.${suggestion}?`;

      return `${variable} doesn't exist — ${namespace}.* has ${names.join(", ")}.${fix}`;
    }
  }

  return null;
}

/**
 * @param line - The failing line
 * @returns Hint for a name inside where() that lacks its `note.` prefix
 *   (`where(velocity > 100)`), or `and`/`or` in place of `&&`/`||`
 */
export function whereNameMistake(line: FailedLine): string | null {
  const { code, before, rest } = line;

  if (!isInside(whereSpans(code), before.length)) {
    return null;
  }

  const word = /^(and|or)\b/i.exec(rest)?.[1];

  if (word != null) {
    return `use && and || inside where(), not "${word}".`;
  }

  // Only where an operand belongs: after `(`, a comparison, `&&`, `||` or `!`.
  const name = /^([A-Za-z_]\w*)(?![\w.(])/.exec(rest)?.[1];

  if (
    name == null ||
    PITCH_LIKE.test(name) ||
    !/[(<>=!&|]$/.test(before.trimEnd())
  ) {
    return null;
  }

  const property = whereProperty(name);

  if (property != null) {
    return `inside where(), write ${property}, not ${name}.`;
  }

  // After a comparison the name is a value (`note.pitch == X`), not a property.
  return /[<>=]$/.test(before.trimEnd())
    ? null
    : `${WHERE_CAN_TEST} — got ${name}.`;
}

/**
 * @param line - The failing line
 * @returns Hint for a condition written without `where(...)`, as in
 *   `v<50: delete`
 */
export function bareConditionMistake(line: FailedLine): string | null {
  const { code, before, rest } = line;

  if (isInside(whereSpans(code), before.length)) {
    return null;
  }

  // `velocity > 100: …` fails after `velocity`, which parsed as a parameter;
  // `pitch == C3: …` fails at the second `=`, after `pitch =` parsed.
  const trimmed = before.trimEnd();
  const split = trimmed.endsWith("=") && rest.startsWith("=") ? "=" : "";
  const head = split === "" ? before : trimmed.slice(0, -1);
  const operand = /(?<![\w.])[A-Za-z][\w.]*\s*$/.exec(head)?.[0] ?? "";
  const joined = /^[<>=!]/.test(rest);
  const text = joined ? operand + split + rest : rest;
  // Keep the line's other selectors (`C1 v<50: …`) in the fix.
  const selector = joined
    ? head.slice(0, head.length - operand.length)
    : before;
  const colon = text.indexOf(":");

  if (colon === -1 || /^where\b/.test(text)) {
    return null;
  }

  // Split at the colon by hand: a regex spanning it backtracks badly on long
  // runs of spaces, and transforms have no length cap.
  const condition = /^([A-Za-z][\w.]*)\s*(<=|>=|==|!=|<|>)\s*(\S.*)$/.exec(
    text.slice(0, colon).trim(),
  );

  if (condition == null) {
    return null;
  }

  const [, left = "", op, right = ""] = condition;
  const property = whereProperty(left);
  const fix =
    `${selector}where(${property} ${op} ${right}): ${text.slice(colon + 1).trim()}`.trimStart();

  if (property == null) {
    return `a condition needs where(...), and ${WHERE_CAN_TEST}.`;
  }

  return isSimpleOperand(right) && fixParses(fix)
    ? `a condition needs where(...) — write "${fix}".`
    : "a condition needs where(...).";
}

/**
 * @param name - A property as written, with or without `note.`
 * @returns The where() property it means, or null when none is sure
 */
function whereProperty(name: string): string | null {
  if (name.includes(".")) {
    return WHERE_PROPERTIES.includes(name) ? name : null;
  }

  const match = WHERE_NOTE_NAMES.includes(name)
    ? name
    : suggestTransformName(name, WHERE_NOTE_NAMES);

  return match == null ? null : `note.${match}`;
}

/**
 * @param text - The right side of a comparison
 * @returns Whether it is one value — not a bare name or another condition
 */
function isSimpleOperand(text: string): boolean {
  if (!/^[^\s&|<>=!]+$/.test(text)) {
    return false;
  }

  return !/^[A-Za-z_]\w*$/.test(text) || PITCH_LITERAL.test(text);
}

/**
 * @param code - The line without comments
 * @returns The [start, end] offsets inside each `where(...)`; an unclosed one
 *   runs to the end of the line
 */
function whereSpans(code: string): Array<[number, number]> {
  const spans: Array<[number, number]> = [];
  let lastEnd = -1;

  for (const match of code.matchAll(/\bwhere\s*\(/g)) {
    const start = match.index + match[0].length;

    if (start <= lastEnd) {
      continue;
    }

    let depth = 1;
    let end = code.length;

    for (let i = start; i < code.length; i++) {
      depth += code[i] === "(" ? 1 : code[i] === ")" ? -1 : 0;

      if (depth === 0) {
        end = i;
        break;
      }
    }

    spans.push([start, end]);
    lastEnd = end;
  }

  return spans;
}

/**
 * @param spans - where() spans from {@link whereSpans}
 * @param index - An offset in the line
 * @returns Whether the offset is inside one of them
 */
function isInside(spans: Array<[number, number]>, index: number): boolean {
  return spans.some(([start, end]) => index >= start && index <= end);
}

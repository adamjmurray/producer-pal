// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { type PeggySyntaxError } from "#src/notation/peggy-parser-types.ts";
import { diagnoseTransformMistake } from "./helpers/transform-mistakes.ts";

const NEAR_MAX_LENGTH = 24;

// Whitespace and comment openers are allowed almost everywhere, so listing
// them as "expected" only buries the real alternatives.
const NOISE_LITERALS = new Set(["//", "#", "/*"]);

interface ExpectedItem {
  type: string;
  text?: string;
  description?: string;
}

/**
 * Format a transform parse failure: where it failed, the text there, and the
 * likely fix when the mistake is a common one.
 * @param error - The Peggy SyntaxError
 * @param source - The full transform string that failed
 * @returns A message naming the position and the fix
 */
export function formatTransformSyntaxError(
  error: PeggySyntaxError,
  source: string,
): string {
  const { offset, line, column } = error.location.start;
  const lineStart = source.lastIndexOf("\n", offset - 1) + 1;
  const newline = source.indexOf("\n", offset);
  const lineText = source
    .slice(lineStart, newline === -1 ? source.length : newline)
    .replace(/\r$/, "");
  const lineColumn = offset - lineStart;

  const detail =
    diagnoseTransformMistake(lineText, lineColumn) ??
    describeExpected(error.expected ?? []);

  return `transform syntax error at position ${offset} (line ${line}, column ${column}) ${near(lineText.slice(lineColumn), offset >= source.length)}: ${detail}`;
}

/**
 * @param rest - The failing line from the failure on
 * @param atEnd - Whether the failure is at the end of the whole input
 * @returns `near "<text>"`, or where the line or input ended
 */
function near(rest: string, atEnd: boolean): string {
  const text = rest.trimEnd();

  if (text === "") {
    return atEnd ? "at end of input" : "at end of line";
  }

  const shown =
    text.length > NEAR_MAX_LENGTH ? `${text.slice(0, NEAR_MAX_LENGTH)}…` : text;

  return `near "${shown}"`;
}

/**
 * Fallback when no known mistake matches: what the grammar would have
 * accepted at the failure.
 * @param expected - Peggy's expected items
 * @returns Short description of the accepted alternatives
 */
function describeExpected(expected: ExpectedItem[]): string {
  const names = new Set<string>();

  for (const item of expected) {
    if (item.type === "other" && item.description != null) {
      names.add(item.description);
    } else if (
      item.type === "literal" &&
      !NOISE_LITERALS.has(String(item.text))
    ) {
      names.add(`"${item.text}"`);
    } else if (item.type === "end") {
      names.add("end of line");
    }
  }

  // Failing at the start of a statement lists every way one can begin.
  if (names.has("parameter name")) {
    return `expected a statement, like "velocity = 100", "C1: v80", or "ratchet(2)".`;
  }

  return names.size > 0
    ? `expected ${[...names].slice(0, 5).join(", ")}.`
    : "unexpected text.";
}

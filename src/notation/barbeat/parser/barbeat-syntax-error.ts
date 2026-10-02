// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import {
  type ExpectedItem,
  fixParses,
  formatSyntaxError,
  invisibleCharHint,
  showNextChar,
  type SyntaxFailure,
} from "#src/notation/peggy-error-formatter.ts";
import { type PeggySyntaxError } from "#src/notation/peggy-parser-types.ts";
import { parse } from "./barbeat-parser.ts";
import { diagnoseBarbeatMistake } from "./helpers/barbeat-mistakes.ts";

// Peggy lists these whenever an item could start; a named item rule hides
// where inside the item the parse really stopped.
const ITEM_START = "note pitch";

const ANY_ITEM =
  "expected a note (C3), a position (1|1), a duration (n/4), a velocity (v100), a probability (p0.5), a [pattern] or an @ bar copy.";

/**
 * Format a bar|beat parse failure: where it failed, the text there, and the
 * likely fix when the mistake is a common one.
 * @param error - The Peggy SyntaxError
 * @param source - The full bar|beat string that failed
 * @returns A message naming the position and the fix
 */
export function formatBarbeatSyntaxError(
  error: PeggySyntaxError,
  source: string,
): string {
  return formatSyntaxError("bar|beat syntax error", error, source, describe);
}

/**
 * @param failure - Where the parse stopped
 * @returns The likely fix, or what the grammar would have accepted
 */
function describe(failure: SyntaxFailure): string {
  const { line, column, expected } = failure;
  const atItemStart = expected.some(
    (item) => item.type === "other" && item.description === ITEM_START,
  );

  return (
    invisibleCharHint(line.slice(column)) ??
    diagnoseBarbeatMistake(failure, atItemStart) ??
    (atItemStart ? ANY_ITEM : describeLiterals(expected, line, column))
  );
}

/**
 * Fallback inside an item, where Peggy expects only specific characters.
 * @param expected - Peggy's expected items
 * @param line - The failing line
 * @param column - 0-based offset in the line where the parse failed
 * @returns Short description of what went wrong
 */
function describeLiterals(
  expected: ExpectedItem[],
  line: string,
  column: number,
): string {
  const literals = expected
    .filter(
      (item) =>
        item.type === "literal" && !/^(\/\/|#|\/\*)$/.test(String(item.text)),
    )
    .map((item) => `"${item.text}"`);
  const unique = [...new Set(literals)];
  const next = showNextChar(line.slice(column));

  // Peggy lists literals only mid-item, so none are expected at the end.
  if (next == null) {
    return "the line ended too soon.";
  }

  if (unique.length > 0) {
    return `expected ${unique.slice(0, 5).join(", ")} before ${next}.`;
  }

  const spaced = `${line.slice(0, column)} ${line.slice(column)}`;

  return fixParses(parse, spaced)
    ? `unexpected ${next}: items are separated by spaces.`
    : `unexpected ${next}.`;
}

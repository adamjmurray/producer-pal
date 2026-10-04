// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import {
  type ExpectedItem,
  formatSyntaxError,
} from "#src/notation/peggy-error-formatter.ts";
import { type PeggySyntaxError } from "#src/notation/peggy-parser-types.ts";
import { diagnoseTransformMistake } from "./helpers/transform-mistakes.ts";

// Whitespace and comment openers are allowed almost everywhere, so listing
// them as "expected" only buries the real alternatives.
const NOISE_LITERALS = new Set(["//", "#", "/*"]);

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
  return formatSyntaxError(
    "transform syntax error",
    error,
    source,
    (failure) =>
      diagnoseTransformMistake(failure) ?? describeExpected(failure.expected),
  );
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

  // Where a value could start, every literal that can begin one is also
  // expected; naming them all only buries the point. Keep the keywords and
  // the closing paren, which a call can take there instead of a value.
  if (names.has("expression")) {
    const also = ['"sync"', '"raw"', '")"'].filter((name) => names.has(name));

    return `expected ${["expression", ...also].join(", ")}.`;
  }

  // Failing at the start of a statement lists every way one can begin.
  if (names.has("parameter name")) {
    return `expected a statement, like "velocity = 100", "C1: v80", or "ratchet(2)".`;
  }

  // A list made only of literals is a closed set (`note.` + a property name),
  // so show all of it; otherwise it is mostly noise, so keep the first few.
  const closed = expected.every((item) => item.type === "literal");
  const shown = closed ? [...names] : [...names].slice(0, 5);

  return names.size > 0 ? `expected ${shown.join(", ")}.` : "unexpected text.";
}

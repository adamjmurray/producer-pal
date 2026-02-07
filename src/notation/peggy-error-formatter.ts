// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import type { PeggySyntaxError } from "./peggy-parser-types.ts";

/**
 * Format a Peggy SyntaxError into a human-readable message
 * @param error - The Peggy SyntaxError with location and expected info
 * @param notationType - "bar|beat" or "transform" for context
 * @returns Formatted error message with position and helpful context
 */
export function formatParserError(
  error: PeggySyntaxError,
  notationType: "bar|beat" | "transform",
): string {
  const location = formatLocation(error.location);
  const expectations = extractLabeledExpectations(error.expected ?? []);
  const found = formatFoundValue(error.found);

  const expectedText =
    expectations.length > 0 ? expectations.join(", ") : "valid syntax";

  return `${notationType} syntax error ${location}: Expected ${expectedText}${found}`;
}

/**
 * Extract human-readable expectations from Peggy's expected array
 * @param expected - Array of expected items from Peggy error
 * @returns Array of labeled expectation strings (max 5)
 */
function extractLabeledExpectations(expected: unknown[]): string[] {
  const labeled: string[] = [];

  for (const item of expected) {
    if (
      item != null &&
      typeof item === "object" &&
      "description" in item &&
      typeof item.description === "string"
    ) {
      labeled.push(item.description);
    }
  }

  // Limit to top 5 expectations to keep messages concise
  return labeled.slice(0, 5);
}

/**
 * Format the "found" value for display
 * @param found - The found value from Peggy error (can be null)
 * @returns Formatted string for display
 */
function formatFoundValue(found: string | null): string {
  if (found == null) {
    return " but reached end of input";
  }

  // Escape control characters for display
  const escaped = found
    .replaceAll("\\", "\\\\")
    .replaceAll("\n", "\\n")
    .replaceAll("\r", "\\r")
    .replaceAll("\t", "\\t");

  return ` but "${escaped}" found`;
}

/**
 * Build location string from Peggy location object
 * @param location - Location object from Peggy error
 * @returns Formatted location string
 */
function formatLocation(
  location:
    | {
        start: { offset: number; line: number; column: number };
        end: { offset: number; line: number; column: number };
      }
    | undefined,
): string {
  if (location?.start == null) {
    return "at unknown position";
  }

  const { offset, line, column } = location.start;

  return `at position ${offset} (line ${line}, column ${column})`;
}

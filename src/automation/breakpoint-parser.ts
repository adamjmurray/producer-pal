// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { type Breakpoint } from "#src/automation/breakpoint-validator.ts";
import * as console from "#src/shared/v8-max-console.ts";

/**
 * Parse a multiline string of `time=value` pairs into Breakpoint objects.
 * Empty lines and lines starting with `//` are skipped. Trailing ` //` comments
 * are stripped. Lines without `=` or with non-numeric time/value are warned and skipped.
 * No sorting or range validation is performed — use validateBreakpoints downstream.
 * @param input - Multiline string of `time=value` pairs
 * @returns Array of Breakpoints in input order
 */
export function parseBreakpoints(input: string): Breakpoint[] {
  const results: Breakpoint[] = [];

  for (const rawLine of input.split("\n")) {
    const trimmed = rawLine.trim();

    if (trimmed === "" || trimmed.startsWith("//")) {
      continue;
    }

    // Strip trailing // comments
    const commentIndex = trimmed.indexOf(" //");
    const line = commentIndex >= 0 ? trimmed.slice(0, commentIndex) : trimmed;

    const eqIndex = line.indexOf("=");

    if (eqIndex < 0) {
      console.warn(`parseBreakpoints: skipping line without "=": ${trimmed}`);
      continue;
    }

    const rawTime = line.slice(0, eqIndex).trim();
    const rawValue = line.slice(eqIndex + 1).trim();

    const time = Number(rawTime);
    const value = Number(rawValue);

    if (!Number.isFinite(time)) {
      console.warn(
        `parseBreakpoints: skipping line with non-numeric time: ${trimmed}`,
      );
      continue;
    }

    if (!Number.isFinite(value)) {
      console.warn(
        `parseBreakpoints: skipping line with non-numeric value: ${trimmed}`,
      );
      continue;
    }

    results.push({ time, value });
  }

  return results;
}

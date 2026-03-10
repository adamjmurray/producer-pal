// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import * as console from "#src/shared/v8-max-console.ts";

/**
 * Parse name=value lines into param entries with value coercion
 * @param input - Multiline string of name=value pairs
 * @returns Array of [name, coerced value] tuples
 */
export function parseParamLines(
  input: string,
): Array<[string, string | number]> {
  const results: Array<[string, string | number]> = [];

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
      console.warn(`updateDevice: skipping line without "=": ${trimmed}`);
      continue;
    }

    const name = line.slice(0, eqIndex).trim();
    const rawValue = line.slice(eqIndex + 1).trim();

    if (name === "") {
      console.warn(`updateDevice: skipping line with empty name: ${trimmed}`);
      continue;
    }

    if (rawValue === "") {
      console.warn(`updateDevice: skipping line with empty value: ${trimmed}`);
      continue;
    }

    const num = Number(rawValue);
    const value = Number.isFinite(num) ? num : rawValue;

    results.push([name, value]);
  }

  return results;
}

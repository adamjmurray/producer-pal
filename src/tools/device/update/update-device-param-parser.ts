// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import * as console from "#src/shared/v8-max-console.ts";
import { parseLabel } from "#src/tools/shared/device/helpers/device-display-helpers.ts";

/**
 * Parse name=value lines into param entries with value coercion
 * @param input - Multiline string of name=value pairs
 * @param toolName - Calling tool name for warning prefix (defaults to "updateDevice")
 * @returns Array of [name, coerced value] tuples
 */
export function parseParamLines(
  input: string,
  toolName: string = "updateDevice",
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
      console.warn(`${toolName}: skipping line without "=": ${trimmed}`);
      continue;
    }

    const name = line.slice(0, eqIndex).trim();
    const rawValue = line.slice(eqIndex + 1).trim();

    if (name === "") {
      console.warn(`${toolName}: skipping line with empty name: ${trimmed}`);
      continue;
    }

    if (rawValue === "") {
      console.warn(`${toolName}: skipping line with empty value: ${trimmed}`);
      continue;
    }

    const num = Number(rawValue);
    let value: string | number;

    if (Number.isFinite(num)) {
      value = num;
    } else {
      // Strip unit suffixes ("72 Hz", "1.5 kHz", "-6 dB") via parseLabel,
      // which handles unit conversion (kHz→Hz, s→ms) and is case-insensitive.
      // Require a recognized unit so strings like "1/16" (division params) or
      // "On"/"Off" (enums) keep their string form for downstream handling.
      const parsed = parseLabel(rawValue);

      value =
        typeof parsed.value === "number" && parsed.unit != null
          ? parsed.value
          : rawValue;
    }

    results.push([name, value]);
  }

  return results;
}

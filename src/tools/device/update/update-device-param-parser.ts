// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { parseLabel } from "#src/tools/shared/device/helpers/device-display-helpers.ts";

/**
 * Normalize a raw param value (always a string after schema coercion) into the
 * value the setter pipeline expects: a number when it parses as a finite number
 * or carries a recognized unit suffix, otherwise the original string.
 *
 * Strings like "1/16" (division params), "On"/"Off" (enums), and note names
 * ("C3") are intentionally kept as strings for downstream handling. "Infinity"
 * and "NaN" are not treated as numbers.
 * @param rawValue - Trimmed value string from a param entry
 * @returns The coerced number, or the original string
 */
export function normalizeParamValue(rawValue: string): string | number {
  const num = Number(rawValue);

  if (Number.isFinite(num)) {
    return num;
  }

  // Strip unit suffixes ("72 Hz", "1.5 kHz", "-6 dB") via parseLabel, which
  // handles unit conversion (kHz→Hz, s→ms) and is case-insensitive. Require a
  // recognized unit so strings like "1/16" or "On"/"Off" keep their string form.
  const parsed = parseLabel(rawValue);

  return typeof parsed.value === "number" && parsed.unit != null
    ? parsed.value
    : rawValue;
}

// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude Code (Anthropic)
// SPDX-License-Identifier: MIT

import { formatDecimal } from "#src/notation/barbeat/serializer/helpers/barbeat-serializer-fractions.ts";

/** Past this many decimals a value is float noise, and reads as 0. */
const MAX_VALUE_DECIMALS = 6;

/**
 * Format a raw parameter value: up to 3 decimals, no trailing zeros. A value
 * below 0.1 keeps 3 significant digits instead, so one on a fine raw range
 * doesn't read back as 0 and shift when the read is written again.
 * @param value - The raw value
 * @returns The value as it is written
 */
export function formatEnvelopeValue(value: number): string {
  const size = Math.abs(value);
  const formatted =
    size > 0 && size < 0.1
      ? value
          .toFixed(
            Math.min(MAX_VALUE_DECIMALS, 2 - Math.floor(Math.log10(size))),
          )
          .replace(/\.?0+$/, "")
      : formatDecimal(value);

  return formatted === "-0" ? "0" : formatted;
}

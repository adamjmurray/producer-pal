// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

// Envelope values are raw, and most parameters run 0..1. One that doesn't
// (a CC Control's 0..127) still takes a 0..1 line without complaint, and plays
// it as a near-flat line.

import {
  type EnvelopePoint,
  type ParameterInfo,
} from "../remote-script-envelope-contract.ts";

/** A range this wide is not a 0..1 scale with a little headroom (pan is -1..1). */
const WIDE_RANGE = 10;

/**
 * Say so when a line written to a wide-ranged parameter looks like it was
 * spelled 0..1.
 * @param points - What was written
 * @param parameter - The parameter, as the remote script describes it
 * @returns The note, or undefined when the values fit the parameter
 */
export function narrowRangeNote(
  points: readonly EnvelopePoint[],
  parameter: ParameterInfo | undefined,
): string | undefined {
  // A stepped parameter's 0 and 1 are two of its settings.
  if (
    parameter == null ||
    parameter.quantized ||
    parameter.max - parameter.min < WIDE_RANGE
  ) {
    return undefined;
  }

  const values = points.map((point) => point.value);
  const low = Math.min(...values);
  const high = Math.max(...values);

  // All zero is a real setting: the wheel at rest.
  if (low < 0 || high > 1 || high === 0) {
    return undefined;
  }

  return `values span ${low}..${high} of the param's ${parameter.min}..${parameter.max} range`;
}

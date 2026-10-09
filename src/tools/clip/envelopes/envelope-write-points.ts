// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

// Turning parsed notation into the points the remote script writes. The curve
// of a segment goes on the point that starts it, as Live stores it.

import {
  type CurveCoefficients,
  curveToCoefficients,
} from "#src/notation/barbeat/envelope/envelope-curves.ts";
import { type EnvelopeNotationPoint } from "#src/notation/barbeat/envelope/envelope-notation.ts";
import { type EnvelopeWritePoint } from "./remote-script-envelope-contract.ts";

/**
 * Build the points to send for one envelope.
 * @param points - The parsed notation
 * @returns One write point per notation point, each carrying the coefficients
 *   of the curved ramp that leaves it
 */
export function envelopeWritePoints(
  points: readonly EnvelopeNotationPoint[],
): EnvelopeWritePoint[] {
  return points.map((point, index) => {
    const next = points[index + 1];
    const coefficients =
      next == null ? undefined : segmentCoefficients(point, next);

    return {
      time: point.time,
      value: point.value,
      ...(point.jump && { jump: true }),
      ...(coefficients != null && { coefficients }),
    };
  });
}

// --- Helpers below main exports ---

/**
 * The curve of the segment between two points, when it draws one.
 * @param start - The point the segment starts at
 * @param end - The point it arrives at
 * @returns The coefficients, or undefined for a straight, flat or jumping segment
 */
function segmentCoefficients(
  start: EnvelopeNotationPoint,
  end: EnvelopeNotationPoint,
): CurveCoefficients | undefined {
  if (end.curve == null || end.jump || end.value === start.value) {
    return undefined;
  }

  return curveToCoefficients(end.curve, end.value > start.value);
}

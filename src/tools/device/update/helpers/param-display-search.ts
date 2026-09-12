// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import * as console from "#src/shared/max/v8-max-console.ts";
import {
  type ParamNumericRange,
  displayAt,
} from "#src/tools/shared/device/helpers/param-numeric-range.ts";

// Enough to pin a boundary to ~1e-9 of the raw range, far finer than the
// resolution Live actually stores. Each search costs one str_for_value call per
// iteration, and we run two.
const BINARY_SEARCH_ITERATIONS = 30;

/**
 * Find the raw value that corresponds to a target display value.
 * Uses direct mapping for linear params (display range ≈ raw range),
 * binary search for non-linear params (e.g., exponential envelope times).
 * @param param - LiveAPI parameter object
 * @param targetDisplay - Target value in display units
 * @param range - The parameter's numeric display range
 * @param label - How to name the parameter in a warning
 * @returns Raw value to set, or null if the range gives nothing to aim at
 */
export function findRawValueForDisplay(
  param: LiveAPI,
  targetDisplay: number,
  range: ParamNumericRange,
  label: string,
): number | null {
  const { rawMin, rawMax, minValue, maxValue } = range;

  // The raw range has room but every value in it displays the same number, so
  // there is no way back from a display value to a raw one. Searching walks to
  // the middle of the raw range and reports success from a value nobody asked
  // for, so skip the write instead. A param whose raw range is itself a single
  // point is not this case — it has exactly one value, and the linear branch
  // below lands on it.
  if (minValue === maxValue && rawMin !== rawMax) {
    console.warn(
      `${label} reads "${range.minLabel}" across its whole range, so there is no value to aim at and it was left alone.`,
    );

    return null;
  }

  // Live drops a value outside the parameter's range instead of clamping it,
  // so both paths below keep to the range. Landing 14 dB from what was asked
  // for otherwise reads as success, so say so in the user's own units.
  if (
    targetDisplay < Math.min(minValue, maxValue) ||
    targetDisplay > Math.max(minValue, maxValue)
  ) {
    warnOutOfRange(range, targetDisplay, label);
  }

  // Linear mapping: display values match raw values — set directly
  const span = Math.abs(rawMax - rawMin);
  const tolerance = span > 0 ? 0.01 * span : 0.01;

  if (
    Math.abs(minValue - rawMin) < tolerance &&
    Math.abs(maxValue - rawMax) < tolerance
  ) {
    return clamp(targetDisplay, rawMin, rawMax);
  }

  // Some params count down as the raw value rises (Multiband Dynamics' ratios
  // run from Inf to 0.50). Negating the display makes those rise again, so one
  // search handles both directions.
  const sign = maxValue < minValue ? -1 : 1;

  return searchRawValueForDisplay(
    param,
    targetDisplay * sign,
    rawMin,
    rawMax,
    sign,
  );
}

/**
 * Warn that a target fell outside the range, in the parameter's own units.
 * @param range - The parameter's numeric display range
 * @param targetDisplay - Target value in display units
 * @param label - How to name the parameter in the warning
 */
function warnOutOfRange(
  range: ParamNumericRange,
  targetDisplay: number,
  label: string,
): void {
  const { minLabel, maxLabel, sentinel } = range;
  const also = sentinel == null ? "" : ` (or "${sentinel.label}")`;

  console.warn(
    `${label} only goes from ${minLabel} to ${maxLabel}${also}, so ${targetDisplay} was set to the nearest valid value.`,
  );
}

/**
 * Clamp a value between two bounds given in either order.
 * @param value - Value to clamp
 * @param a - One bound
 * @param b - The other bound
 * @returns The clamped value
 */
function clamp(value: number, a: number, b: number): number {
  return Math.min(Math.max(value, Math.min(a, b)), Math.max(a, b));
}

/**
 * Binary search the raw range for a value that displays as the target.
 *
 * Two searches: one to bracket the target between the display steps on either
 * side of it, one to find the far edge of whichever step is closer. We return
 * the middle of that step, never its edge. An edge value is wrong about half
 * the time: the true edge sits somewhere inside the search's final interval,
 * and Live then snaps what we write to its own resolution (32-bit float at
 * best, coarser on some params). Either nudge is enough to land in the
 * neighboring step, and the param reads back one step off.
 * @param param - LiveAPI parameter object
 * @param targetDisplay - Target display value
 * @param rawMin - Raw minimum
 * @param rawMax - Raw maximum
 * @param sign - 1 for a rising display, -1 for a falling one
 * @returns Raw value inside the nearest reachable display step
 */
function searchRawValueForDisplay(
  param: LiveAPI,
  targetDisplay: number,
  rawMin: number,
  rawMax: number,
  sign: number,
): number {
  const { lo, hi } = searchBoundary(
    param,
    rawMin,
    rawMax,
    sign,
    (display) => display >= targetDisplay,
  );
  const above = orientedDisplayAt(param, hi, sign);

  if (above == null) {
    return hi;
  }

  // `hi` is a shared edge: the bottom of the step at or above the target, and
  // the top of the step below it. So rounding either way costs one more search,
  // never two. Ties round up, matching Live's own display rounding.
  const below = orientedDisplayAt(param, lo, sign);

  if (
    below != null &&
    below < targetDisplay &&
    targetDisplay - below < above - targetDisplay
  ) {
    const start = searchBoundary(
      param,
      rawMin,
      lo,
      sign,
      (display) => display >= below,
    ).hi;

    return (start + hi) / 2;
  }

  const end = searchBoundary(
    param,
    hi,
    rawMax,
    sign,
    (display) => display > above,
  ).hi;

  return (hi + end) / 2;
}

/**
 * Bracket the lowest raw value whose display satisfies `reached`, assuming
 * display rises with the raw value. Returns the final interval: `hi` is that
 * value (or rawMax if nothing in the range satisfies it), `lo` is the last raw
 * value known not to satisfy it. If a label stops being a parseable number,
 * both collapse to the current midpoint.
 * @param param - LiveAPI parameter object
 * @param rawMin - Raw minimum
 * @param rawMax - Raw maximum
 * @param sign - 1 for a rising display, -1 for a falling one
 * @param reached - Predicate on the oriented display value
 * @returns The bracketing interval around the boundary
 */
function searchBoundary(
  param: LiveAPI,
  rawMin: number,
  rawMax: number,
  sign: number,
  reached: (display: number) => boolean,
): { lo: number; hi: number } {
  let lo = rawMin;
  let hi = rawMax;

  for (let i = 0; i < BINARY_SEARCH_ITERATIONS; i++) {
    const mid = (lo + hi) / 2;
    const display = orientedDisplayAt(param, mid, sign);

    if (display == null) {
      return { lo: mid, hi: mid };
    }

    if (reached(display)) {
      hi = mid;
    } else {
      lo = mid;
    }
  }

  return { lo, hi };
}

/**
 * The display at a raw value, flipped so it always rises with the raw value.
 * A descending param passes sign -1; every comparison in the search then reads
 * the same way for both directions.
 * @param param - LiveAPI parameter object
 * @param raw - Raw value to read
 * @param sign - 1 for a rising display, -1 for a falling one
 * @returns The oriented display value, or null if the label isn't a number
 */
function orientedDisplayAt(
  param: LiveAPI,
  raw: number,
  sign: number,
): number | null {
  const display = displayAt(param, raw);

  return display == null ? null : display * sign;
}

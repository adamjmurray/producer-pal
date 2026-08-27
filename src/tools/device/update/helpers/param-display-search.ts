// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import {
  parseLabel,
  strForValue,
} from "#src/tools/shared/device/helpers/device-display-helpers.ts";

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
 * @param rawMin - Raw minimum value
 * @param rawMax - Raw maximum value
 * @param minLabel - Already-computed str_for_value(rawMin)
 * @returns Raw value to set, or null if labels aren't parseable
 */
export function findRawValueForDisplay(
  param: LiveAPI,
  targetDisplay: number,
  rawMin: number,
  rawMax: number,
  minLabel: string,
): number | null {
  const minValue = parseLabel(minLabel).value;

  if (minValue == null || typeof minValue === "string") {
    return null;
  }

  const maxValue = displayAt(param, rawMax);

  if (maxValue == null) {
    return null;
  }

  // Linear mapping: display values match raw values — set directly
  const range = Math.abs(rawMax - rawMin);
  const tolerance = range > 0 ? 0.01 * range : 0.01;

  if (
    Math.abs(minValue - rawMin) < tolerance &&
    Math.abs(maxValue - rawMax) < tolerance
  ) {
    return targetDisplay;
  }

  return searchRawValueForDisplay(param, targetDisplay, rawMin, rawMax);
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
 * @returns Raw value inside the nearest reachable display step
 */
function searchRawValueForDisplay(
  param: LiveAPI,
  targetDisplay: number,
  rawMin: number,
  rawMax: number,
): number {
  const { lo, hi } = searchBoundary(
    param,
    rawMin,
    rawMax,
    (display) => display >= targetDisplay,
  );
  const above = displayAt(param, hi);

  if (above == null) {
    return hi;
  }

  // `hi` is a shared edge: the bottom of the step at or above the target, and
  // the top of the step below it. So rounding either way costs one more search,
  // never two. Ties round up, matching Live's own display rounding.
  const below = displayAt(param, lo);

  if (
    below != null &&
    below < targetDisplay &&
    targetDisplay - below < above - targetDisplay
  ) {
    const start = searchBoundary(
      param,
      rawMin,
      lo,
      (display) => display >= below,
    ).hi;

    return (start + hi) / 2;
  }

  const end = searchBoundary(
    param,
    hi,
    rawMax,
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
 * @param reached - Predicate on the display value
 * @returns The bracketing interval around the boundary
 */
function searchBoundary(
  param: LiveAPI,
  rawMin: number,
  rawMax: number,
  reached: (display: number) => boolean,
): { lo: number; hi: number } {
  let lo = rawMin;
  let hi = rawMax;

  for (let i = 0; i < BINARY_SEARCH_ITERATIONS; i++) {
    const mid = (lo + hi) / 2;
    const display = displayAt(param, mid);

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
 * Read a param's display value at a raw value.
 * @param param - LiveAPI parameter object
 * @param raw - Raw value to query
 * @returns Display value, or null if the label isn't a parseable number
 */
function displayAt(param: LiveAPI, raw: number): number | null {
  const value = parseLabel(strForValue(param, raw)).value;

  return value == null || typeof value === "string" ? null : value;
}

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
 * Two searches: one for where the target's display step starts, one for where
 * it ends. We return the middle of that step, never its edge. An edge value is
 * wrong about half the time: the true edge sits somewhere inside the search's
 * final interval, and Live then snaps what we write to its own resolution
 * (32-bit float at best, coarser on some params). Either nudge is enough to
 * land in the neighboring step, and the param reads back one step off.
 * @param param - LiveAPI parameter object
 * @param targetDisplay - Target display value
 * @param rawMin - Raw minimum
 * @param rawMax - Raw maximum
 * @returns Raw value inside the target's display step
 */
function searchRawValueForDisplay(
  param: LiveAPI,
  targetDisplay: number,
  rawMin: number,
  rawMax: number,
): number {
  const start = searchBoundary(
    param,
    rawMin,
    rawMax,
    (display) => display >= targetDisplay,
  );
  const startDisplay = displayAt(param, start);

  if (startDisplay == null) {
    return start;
  }

  const end = searchBoundary(
    param,
    start,
    rawMax,
    (display) => display > startDisplay,
  );

  return (start + end) / 2;
}

/**
 * Find the lowest raw value whose display satisfies `reached`, assuming display
 * rises with the raw value. Returns rawMax if nothing in the range satisfies it,
 * or the current midpoint if a label stops being a parseable number.
 * @param param - LiveAPI parameter object
 * @param rawMin - Raw minimum
 * @param rawMax - Raw maximum
 * @param reached - Predicate on the display value
 * @returns Raw value at the boundary
 */
function searchBoundary(
  param: LiveAPI,
  rawMin: number,
  rawMax: number,
  reached: (display: number) => boolean,
): number {
  let lo = rawMin;
  let hi = rawMax;

  for (let i = 0; i < BINARY_SEARCH_ITERATIONS; i++) {
    const mid = (lo + hi) / 2;
    const display = displayAt(param, mid);

    if (display == null) {
      return mid;
    }

    if (reached(display)) {
      hi = mid;
    } else {
      lo = mid;
    }
  }

  return hi;
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

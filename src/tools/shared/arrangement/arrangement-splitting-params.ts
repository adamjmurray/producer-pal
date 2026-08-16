// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// Parsing and validation for the split parameter, kept apart from the splitting
// itself (arrangement-splitting.ts).

import { barBeatToAbletonBeats } from "#src/notation/barbeat/time/barbeat-time.ts";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import * as console from "#src/shared/max/v8-max-console.ts";
import { MAX_SPLIT_POINTS } from "#src/tools/constants.ts";

/**
 * Prepare split parameters by parsing comma-separated bar|beat positions.
 * @param split - Comma-separated bar|beat positions (e.g., "2|1, 3|1, 4|1")
 * @param arrangementClips - Array of arrangement clips
 * @param warnings - Set to track warnings already issued
 * @returns Array of beat offsets or null
 */
export function prepareSplitParams(
  split: string | undefined,
  arrangementClips: LiveAPI[],
  warnings: Set<string>,
): number[] | null {
  if (split == null) {
    return null;
  }

  if (arrangementClips.length === 0) {
    if (!warnings.has("split-no-arrangement")) {
      console.warn("split requires arrangement clips");
      warnings.add("split-no-arrangement");
    }

    return null;
  }

  const liveSet = LiveAPI.from(livePath.liveSet);
  const songTimeSigNumerator = liveSet.getProperty(
    "signature_numerator",
  ) as number;
  const songTimeSigDenominator = liveSet.getProperty(
    "signature_denominator",
  ) as number;

  const splitPoints = parseSplitPoints(
    split,
    songTimeSigNumerator,
    songTimeSigDenominator,
  );

  if (splitPoints == null || splitPoints.length === 0) {
    if (!warnings.has("split-invalid-format")) {
      console.warn(
        `Invalid split format: "${split}". Expected comma-separated bar|beat positions like "2|1, 3|1"`,
      );
      warnings.add("split-invalid-format");
    }

    return null;
  }

  if (splitPoints.length > MAX_SPLIT_POINTS) {
    if (!warnings.has("split-max-exceeded")) {
      console.warn(
        `Too many split points (${splitPoints.length}), max is ${MAX_SPLIT_POINTS}`,
      );
      warnings.add("split-max-exceeded");
    }

    return null;
  }

  // Filter out points at 0 (can't split at the very start)
  const validPoints = splitPoints.filter((p) => p > 0);

  if (validPoints.length === 0) {
    if (!warnings.has("split-no-valid-points")) {
      console.warn("No valid split points (all at or before clip start)");
      warnings.add("split-no-valid-points");
    }

    return null;
  }

  return validPoints;
}

/**
 * Parse comma-separated bar|beat positions into beat offsets from clip start.
 * Positions use clip-local coordinates where 1|1 is the clip start.
 * @param splitStr - Comma-separated bar|beat positions (e.g., "2|1, 3|1, 4|1")
 * @param timeSigNumerator - Time signature numerator
 * @param timeSigDenominator - Time signature denominator
 * @returns Sorted array of beat offsets, or null if invalid
 */
function parseSplitPoints(
  splitStr: string,
  timeSigNumerator: number,
  timeSigDenominator: number,
): number[] | null {
  const points: number[] = [];
  const parts = splitStr.split(",").map((s) => s.trim());

  for (const part of parts) {
    if (!part) continue;

    try {
      const beats = barBeatToAbletonBeats(
        part,
        timeSigNumerator,
        timeSigDenominator,
      );

      points.push(beats);
    } catch {
      return null;
    }
  }

  // Sort and remove duplicates
  return [...new Set(points)].sort((a, b) => a - b);
}

// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// Parsing and validation for the split parameter, kept apart from the splitting
// itself (arrangement-splitting.ts).

import { barBeatToAbletonBeats } from "#src/notation/barbeat/time/barbeat-time.ts";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import * as console from "#src/shared/max/v8-max-console.ts";
import { type SplitMode } from "#src/tools/shared/arrangement/arrangement-splitting.ts";
import { MAX_SPLIT_POINTS } from "#src/tools/constants.ts";

/**
 * Prepare split parameters by parsing comma-separated bar|beat positions.
 * Both split params parse the same way, in song meter; `mode` only decides how
 * the results are read later, and what the warnings call the param.
 * @param split - Comma-separated bar|beat positions (e.g., "2|1, 3|1, 4|1")
 * @param arrangementClips - Array of arrangement clips
 * @param warnings - Set to track warnings already issued
 * @param mode - Which split param the positions came from
 * @returns Array of beat positions or null
 */
export function prepareSplitParams(
  split: string | undefined,
  arrangementClips: LiveAPI[],
  warnings: Set<string>,
  mode: SplitMode,
): number[] | null {
  if (split == null) {
    return null;
  }

  if (arrangementClips.length === 0) {
    if (!warnings.has("split-no-arrangement")) {
      console.warn(`${mode.param} requires arrangement clips`);
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
        `Invalid ${mode.param} format: "${split}". Expected comma-separated bar|beat positions like "2|1, 3|1"`,
      );
      warnings.add("split-invalid-format");
    }

    return null;
  }

  if (splitPoints.length > MAX_SPLIT_POINTS) {
    if (!warnings.has("split-max-exceeded")) {
      console.warn(
        `Too many ${mode.param} points (${splitPoints.length}), max is ${MAX_SPLIT_POINTS}`,
      );
      warnings.add("split-max-exceeded");
    }

    return null;
  }

  // Filter out points at 0. Nothing can be split there: in clip coordinates
  // that's the clip's own start, and in song coordinates no clip begins before
  // it. Per-clip bounds are checked later, once each clip's start is known.
  const validPoints = splitPoints.filter((p) => p > 0);

  if (validPoints.length === 0) {
    if (!warnings.has("split-no-valid-points")) {
      const origin = mode.origin === "song" ? "the song start" : "clip start";

      console.warn(
        `No valid ${mode.param} points (all at or before ${origin})`,
      );
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
  return [...new Set(points)].toSorted((a, b) => a - b);
}

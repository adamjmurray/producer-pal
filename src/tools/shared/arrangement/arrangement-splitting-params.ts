// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

// Parsing and validation for the split parameter, kept apart from the splitting
// itself (arrangement-splitting.ts).

import { barBeatToAbletonBeats } from "#src/notation/barbeat/time/barbeat-time.ts";
import { livePath } from "#src/shared/live-api-path-builders.ts";
import { type SplitMode } from "#src/tools/shared/arrangement/arrangement-splitting.ts";
import { MAX_SPLIT_POINTS } from "#src/tools/constants.ts";
import { targetEntries } from "#src/tools/shared/helpers/target-entries.ts";

/**
 * Read the split positions, in song meter, and refuse any the tool can't use.
 * Both split params read the same way; `mode` only names the param in errors.
 * Nothing here depends on a clip, so a bad list is refused before any clip is
 * cut.
 * @param split - Comma-separated bar|beat positions (e.g., "2|1, 3|1, 4|1")
 * @param mode - Which split param the positions came from
 * @returns Sorted beat positions, none at 0
 */
export function readSplitPoints(split: string, mode: SplitMode): number[] {
  const liveSet = LiveAPI.from(livePath.liveSet);
  const splitPoints = parseSplitPoints(
    split,
    liveSet.getProperty("signature_numerator") as number,
    liveSet.getProperty("signature_denominator") as number,
    mode.param,
  );

  if (splitPoints == null || splitPoints.length === 0) {
    throw new Error(
      `Invalid ${mode.param} format: "${split}". Expected comma-separated bar|beat positions like "2|1, 3|1"`,
    );
  }

  if (splitPoints.length > MAX_SPLIT_POINTS) {
    throw new Error(
      `Too many ${mode.param} points (${splitPoints.length}), max is ${MAX_SPLIT_POINTS}`,
    );
  }

  // Nothing can be split at 0: in clip coordinates that's the clip's own start,
  // and in song coordinates no clip begins before it. Per-clip bounds are
  // checked later, once each clip's start is known.
  const validPoints = splitPoints.filter((p) => p > 0);

  if (validPoints.length === 0) {
    const origin = mode.origin === "song" ? "the song start" : "clip start";

    throw new Error(
      `No valid ${mode.param} points (all at or before ${origin})`,
    );
  }

  return validPoints;
}

/**
 * Parse comma-separated bar|beat positions into beat offsets from clip start.
 * Positions use clip-local coordinates where 1|1 is the clip start.
 * @param splitStr - Comma-separated bar|beat positions (e.g., "2|1, 3|1, 4|1")
 * @param timeSigNumerator - Time signature numerator
 * @param timeSigDenominator - Time signature denominator
 * @param label - The split param's name, for list errors
 * @returns Sorted array of beat offsets, or null if a position is invalid
 * @throws Error when the list has an empty entry or names nothing
 */
function parseSplitPoints(
  splitStr: string,
  timeSigNumerator: number,
  timeSigDenominator: number,
  label: string,
): number[] | null {
  const points: number[] = [];

  for (const part of targetEntries(splitStr, label)) {
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

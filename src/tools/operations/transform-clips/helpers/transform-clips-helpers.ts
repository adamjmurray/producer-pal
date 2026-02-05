// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: AGPL-3.0-or-later

import {
  barBeatDurationToAbletonBeats,
  barBeatToAbletonBeats,
} from "#src/notation/barbeat/time/barbeat-time.ts";
import * as console from "#src/shared/v8-max-console.ts";
import {
  parseCommaSeparatedFloats,
  parseCommaSeparatedIds,
  parseCommaSeparatedIndices,
} from "#src/tools/shared/utils.ts";

/**
 * Parse transpose values from comma-separated string
 * @param transposeValues - Comma-separated transpose values
 * @param transposeMin - Minimum transpose value (warning if used with transposeValues)
 * @param transposeMax - Maximum transpose value (warning if used with transposeValues)
 * @returns Array of transpose values or null
 */
export function parseTransposeValues(
  transposeValues?: string,
  transposeMin?: number,
  transposeMax?: number,
): number[] | null {
  if (transposeValues == null) {
    return null;
  }

  const transposeValuesArray = parseCommaSeparatedFloats(transposeValues);

  if (transposeValuesArray.length === 0) {
    throw new Error("transposeValues must contain at least one valid number");
  }

  if (transposeMin != null || transposeMax != null) {
    console.warn("transposeValues ignores transposeMin/transposeMax");
  }

  return transposeValuesArray;
}

/**
 * Get clip IDs from direct list or arrangement track query
 * @param clipIds - Comma-separated list of clip IDs
 * @param arrangementTrackIndex - Track index(es) to query for arrangement clips, comma-separated for multiple
 * @param arrangementStart - Start position in bar|beat format
 * @param arrangementLength - Length in bar:beat format
 * @returns Array of clip IDs
 */
export function getClipIds(
  clipIds?: string,
  arrangementTrackIndex?: string,
  arrangementStart?: string,
  arrangementLength?: string,
): string[] {
  if (clipIds) {
    return parseCommaSeparatedIds(clipIds);
  }

  if (arrangementTrackIndex == null) {
    throw new Error(
      "transformClips failed: clipIds or arrangementTrackIndex is required",
    );
  }

  const trackIndices = parseCommaSeparatedIndices(arrangementTrackIndex);
  const liveSet = LiveAPI.from("live_set");
  const songTimeSigNumerator = liveSet.getProperty(
    "signature_numerator",
  ) as number;
  const songTimeSigDenominator = liveSet.getProperty(
    "signature_denominator",
  ) as number;

  let arrangementStartBeats = 0;
  let arrangementEndBeats = Infinity;

  if (arrangementStart != null) {
    arrangementStartBeats = barBeatToAbletonBeats(
      arrangementStart,
      songTimeSigNumerator,
      songTimeSigDenominator,
    );
  }

  if (arrangementLength != null) {
    const arrangementLengthBeats = barBeatDurationToAbletonBeats(
      arrangementLength,
      songTimeSigNumerator,
      songTimeSigDenominator,
    );

    if (arrangementLengthBeats <= 0) {
      throw new Error("arrangementLength must be greater than 0");
    }

    arrangementEndBeats = arrangementStartBeats + arrangementLengthBeats;
  }

  const result: string[] = [];

  for (const trackIndex of trackIndices) {
    const track = LiveAPI.from(`live_set tracks ${trackIndex}`);

    if (!track.exists()) {
      throw new Error(`transformClips failed: track ${trackIndex} not found`);
    }

    const trackClipIds = track.getChildIds("arrangement_clips");

    for (const clipId of trackClipIds) {
      const clip = LiveAPI.from(clipId);
      const clipStartTime = clip.getProperty("start_time") as number;

      if (
        clipStartTime >= arrangementStartBeats &&
        clipStartTime < arrangementEndBeats
      ) {
        result.push(clipId);
      }
    }
  }

  return result;
}

/**
 * Creates a seeded random number generator using Mulberry32 algorithm
 * @param seed - The seed value
 * @returns A function that returns a random number between 0 and 1
 */
export function createSeededRNG(seed: number): () => number {
  let state = seed;

  return function () {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);

    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;

    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Generates a random number within a range
 * @param min - Minimum value
 * @param max - Maximum value
 * @param rng - Random number generator function
 * @returns Random number between min and max
 */
export function randomInRange(
  min: number,
  max: number,
  rng: () => number,
): number {
  return min + rng() * (max - min);
}

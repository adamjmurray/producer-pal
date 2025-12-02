import {
  barBeatDurationToAbletonBeats,
  barBeatToAbletonBeats,
} from "#src/notation/barbeat/time/barbeat-time.js";
import * as console from "#src/shared/v8-max-console.js";
import {
  parseCommaSeparatedIds,
  parseCommaSeparatedIndices,
} from "#src/tools/shared/utils.js";
import {
  hasAudioTransformParams,
  hasMidiTransformParams,
  applyAudioTransformIfNeeded,
  applyMidiTransformIfNeeded,
  applyParameterTransforms,
} from "./transform-clips-params-helpers.js";
import {
  performShuffling,
  shuffleArray,
} from "./transform-clips-shuffling-helpers.js";
import {
  prepareSliceParams,
  performSlicing,
} from "./transform-clips-slicing-helpers.js";

// Re-export for backward compatibility
export {
  prepareSliceParams,
  performSlicing,
  performShuffling,
  hasAudioTransformParams,
  hasMidiTransformParams,
  applyAudioTransformIfNeeded,
  applyMidiTransformIfNeeded,
  applyParameterTransforms,
  shuffleArray,
};

/**
 * Parse transpose values from comma-separated string
 * @param {string} transposeValues - Comma-separated transpose values
 * @param {number} transposeMin - Minimum transpose value (warning if used with transposeValues)
 * @param {number} transposeMax - Maximum transpose value (warning if used with transposeValues)
 * @returns {Array<number>|null} - Array of transpose values or null
 */
export function parseTransposeValues(
  transposeValues,
  transposeMin,
  transposeMax,
) {
  if (transposeValues == null) {
    return null;
  }
  const transposeValuesArray = transposeValues
    .split(",")
    .map((v) => parseFloat(v.trim()))
    .filter((v) => !isNaN(v));
  if (transposeValuesArray.length === 0) {
    throw new Error("transposeValues must contain at least one valid number");
  }

  if (transposeMin != null || transposeMax != null) {
    console.error("Warning: transposeValues ignores transposeMin/transposeMax");
  }
  return transposeValuesArray;
}

/**
 * Get clip IDs from direct list or arrangement track query
 * @param {string} clipIds - Comma-separated list of clip IDs
 * @param {string} arrangementTrackIndex - Track index(es) to query for arrangement clips, comma-separated for multiple
 * @param {string} arrangementStart - Start position in bar|beat format
 * @param {string} arrangementLength - Length in bar:beat format
 * @returns {Array<string>} - Array of clip IDs
 */
export function getClipIds(
  clipIds,
  arrangementTrackIndex,
  arrangementStart,
  arrangementLength,
) {
  if (clipIds) {
    return parseCommaSeparatedIds(clipIds);
  }
  if (arrangementTrackIndex == null) {
    throw new Error(
      "transformClips failed: clipIds or arrangementTrackIndex is required",
    );
  }

  const trackIndices = parseCommaSeparatedIndices(arrangementTrackIndex);
  const liveSet = new LiveAPI("live_set");
  const songTimeSigNumerator = liveSet.getProperty("signature_numerator");
  const songTimeSigDenominator = liveSet.getProperty("signature_denominator");

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

  const result = [];
  for (const trackIndex of trackIndices) {
    const track = new LiveAPI(`live_set tracks ${trackIndex}`);
    if (!track.exists()) {
      throw new Error(`transformClips failed: track ${trackIndex} not found`);
    }
    const trackClipIds = track.getChildIds("arrangement_clips");
    for (const clipId of trackClipIds) {
      const clip = new LiveAPI(clipId);
      const clipStartTime = clip.getProperty("start_time");
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
 * @param {number} seed - The seed value
 * @returns {function(): number} A function that returns a random number between 0 and 1
 */
export function createSeededRNG(seed) {
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
 * @param {number} min - Minimum value
 * @param {number} max - Maximum value
 * @param {function(): number} rng - Random number generator function
 * @returns {number} Random number between min and max
 */
export function randomInRange(min, max, rng) {
  return min + rng() * (max - min);
}

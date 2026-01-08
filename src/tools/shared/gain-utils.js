/**
 * Utilities for converting between Ableton Live's normalized gain parameter (0-1)
 * and decibel (dB) values.
 *
 * Uses a pre-collected lookup table with 513 samples and linear interpolation
 * for accurate conversion throughout the entire range.
 *
 * @module gain-utils
 */

import { LOOKUP_TABLE } from "./gain-lookup-table.js";

/**
 * Converts Ableton Live's normalized gain parameter (0-1) to decibels (dB).
 *
 * Uses a lookup table with linear interpolation for high accuracy across the full range.
 * The table contains 513 precisely measured samples from Live.
 *
 * Accuracy: < 0.5 dB error everywhere, < 0.1 dB in critical mixing range (-18 to +24 dB)
 *
 * @param {number} gain - Normalized gain value from Live API (0 to 1)
 * @returns {number} Decibel value (-Infinity to 24 dB)
 *
 * @example
 * liveGainToDb(0.4)   // ~0.0 dB (unity gain)
 * liveGainToDb(0.5)   // ~4.0 dB
 * liveGainToDb(1.0)   // 24.0 dB
 * liveGainToDb(0.0)   // -Infinity
 */
export function liveGainToDb(gain) {
  if (gain <= 0) {
    return -Infinity;
  }

  if (gain >= 1) {
    return 24; // Maximum gain in Live
  }

  // Find bracketing points in lookup table (binary search)
  let lowerIndex = 0;
  let upperIndex = LOOKUP_TABLE.length - 1;

  while (upperIndex - lowerIndex > 1) {
    const mid = Math.floor((lowerIndex + upperIndex) / 2);

    if (LOOKUP_TABLE[mid].gain <= gain) {
      lowerIndex = mid;
    } else {
      upperIndex = mid;
    }
  }

  const lower = LOOKUP_TABLE[lowerIndex];
  const upper = LOOKUP_TABLE[upperIndex];

  // Handle edge cases with null/invalid dB values
  if (lower.dB === null || lower.dB === -Infinity) {
    if (upper.dB === null || upper.dB === -Infinity) {
      return -Infinity;
    }

    return upper.dB;
  }

  if (upper.dB === null || upper.dB === -Infinity) {
    return lower.dB;
  }

  // Linear interpolation
  const t = (gain - lower.gain) / (upper.gain - lower.gain);
  const dB = lower.dB + t * (upper.dB - lower.dB);

  // Round to 2 decimal places and remove trailing zeros
  return Number.parseFloat(dB.toFixed(2));
}

/**
 * Converts decibels (dB) to Ableton Live's normalized gain parameter (0-1).
 *
 * Uses a lookup table with linear interpolation for high accuracy.
 * Result is clamped to valid Live gain range [0, 1].
 *
 * @param {number} dB - Decibel value
 * @returns {number} Normalized gain value (0 to 1)
 *
 * @example
 * dbToLiveGain(0)     // ~0.4 (unity gain)
 * dbToLiveGain(4)     // ~0.5
 * dbToLiveGain(24)    // 1.0
 * dbToLiveGain(-70)   // ~0
 */
export function dbToLiveGain(dB) {
  if (dB === -Infinity || dB < -70) {
    return 0;
  }

  if (dB >= 24) {
    return 1;
  }

  // Find bracketing points (linear search, table is small)
  let lowerIndex = -1;
  let upperIndex = -1;

  for (let i = 0; i < LOOKUP_TABLE.length; i++) {
    const entry = LOOKUP_TABLE[i];

    if (entry.dB === null || entry.dB === -Infinity) {
      continue;
    }

    if (entry.dB <= dB) {
      lowerIndex = i;
    } else if (upperIndex === -1) {
      upperIndex = i;
      break;
    }
  }

  // Handle edge cases
  if (lowerIndex === -1) {
    return 0;
  }

  if (upperIndex === -1) {
    return LOOKUP_TABLE[lowerIndex].gain;
  }

  const lower = LOOKUP_TABLE[lowerIndex];
  const upper = LOOKUP_TABLE[upperIndex];

  // Linear interpolation
  const t = (dB - lower.dB) / (upper.dB - lower.dB);
  const gain = lower.gain + t * (upper.gain - lower.gain);

  return Math.max(0, Math.min(1, gain));
}

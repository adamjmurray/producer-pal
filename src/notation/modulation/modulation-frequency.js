import { barBeatDurationToMusicalBeats } from "../barbeat/barbeat-time.js";

/**
 * Parse a frequency parameter and convert to period in musical beats
 * @param {Object} freqObj - Frequency object from parser: {type: "frequency", bars: number, beats: number}
 * @param {number} timeSigNumerator - Time signature numerator
 * @param {number} timeSigDenominator - Time signature denominator
 * @returns {number} Period in musical beats
 */
export function parseFrequency(freqObj, timeSigNumerator, timeSigDenominator) {
  if (freqObj.type !== "frequency") {
    throw new Error(
      `Invalid frequency object: expected type "frequency", got "${freqObj.type}"`,
    );
  }

  // Convert bar:beat duration to musical beats
  const barBeatString = `${freqObj.bars}:${freqObj.beats}`;
  const periodInBeats = barBeatDurationToMusicalBeats(
    barBeatString,
    timeSigNumerator,
    timeSigDenominator,
  );

  if (periodInBeats <= 0) {
    throw new Error(
      `Frequency period must be positive, got: ${periodInBeats} beats (from ${barBeatString}t)`,
    );
  }

  return periodInBeats;
}

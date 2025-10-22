import { barBeatDurationToMusicalBeats } from "../barbeat/barbeat-time.js";

/**
 * Parse a period parameter and convert to period in musical beats
 * @param {Object} periodObj - Period object from parser: {type: "period", bars: number, beats: number}
 * @param {number} timeSigNumerator - Time signature numerator
 * @param {number} timeSigDenominator - Time signature denominator
 * @returns {number} Period in musical beats
 */
export function parseFrequency(
  periodObj,
  timeSigNumerator,
  timeSigDenominator,
) {
  if (periodObj.type !== "period") {
    throw new Error(
      `Invalid period object: expected type "period", got "${periodObj.type}"`,
    );
  }

  // Convert bar:beat duration to musical beats
  const barBeatString = `${periodObj.bars}:${periodObj.beats}`;
  const periodInBeats = barBeatDurationToMusicalBeats(
    barBeatString,
    timeSigNumerator,
    timeSigDenominator,
  );

  if (periodInBeats <= 0) {
    throw new Error(
      `Period must be positive, got: ${periodInBeats} beats (from ${barBeatString}t)`,
    );
  }

  return periodInBeats;
}

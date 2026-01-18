import { barBeatDurationToMusicalBeats } from "#src/notation/barbeat/time/barbeat-time.js";

/**
 * @typedef {object} PeriodObject
 * @property {'period'} type - Type identifier
 * @property {number} bars - Number of bars
 * @property {number} beats - Number of beats
 */

/**
 * Parse a period parameter and convert to period in musical beats
 * @param {PeriodObject} periodObj - Period object from parser: {type: "period", bars: number, beats: number}
 * @param {number} timeSigNumerator - Time signature numerator
 * @returns {number} Period in musical beats
 */
export function parseFrequency(periodObj, timeSigNumerator) {
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
  );

  if (periodInBeats <= 0) {
    throw new Error(
      `Period must be positive, got: ${periodInBeats} beats (from ${barBeatString}t)`,
    );
  }

  return periodInBeats;
}

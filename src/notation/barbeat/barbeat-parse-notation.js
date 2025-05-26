// src/notation/barbeat/barbeat-parse-notation.js
import {
  DEFAULT_BEATS_PER_BAR,
  DEFAULT_DURATION,
  DEFAULT_PROBABILITY,
  DEFAULT_TIME,
  DEFAULT_VELOCITY,
  DEFAULT_VELOCITY_DEVIATION,
} from "./barbeat-config";
import * as parser from "./barbeat-parser";

/**
 * Convert BarBeat notation to note events
 * @param {string} barBeatExpression - BarBeat notation string
 * @param {Object} options - Options
 * @param {number} [options.beatsPerBar] - beats per bar (legacy, prefer timeSigNumerator/timeSigDenominator)
 * @param {number} [options.timeSigNumerator] - Time signature numerator
 * @param {number} [options.timeSigDenominator] - Time signature denominator
 * @returns {Array<{pitch: number, start_time: number, duration: number, velocity: number}>}
 */
export function parseNotation(barBeatExpression, options = {}) {
  if (!barBeatExpression) return [];

  const { beatsPerBar: beatsPerBarOption, timeSigNumerator, timeSigDenominator } = options;
  if (
    (timeSigNumerator != null && timeSigDenominator == null) ||
    (timeSigDenominator != null && timeSigNumerator == null)
  ) {
    throw new Error("Time signature must be specified with both numerator and denominator");
  }
  const beatsPerBar = timeSigNumerator ?? beatsPerBarOption ?? DEFAULT_BEATS_PER_BAR;

  try {
    const ast = parser.parse(barBeatExpression);

    // Process AST maintaining state
    let currentTime = DEFAULT_TIME;
    let currentVelocity = DEFAULT_VELOCITY;
    let currentDuration = DEFAULT_DURATION;
    let currentProbability = DEFAULT_PROBABILITY;
    let currentVelocityMin = null;
    let currentVelocityMax = null;

    const events = [];

    for (const element of ast) {
      if (element.bar !== undefined && element.beat !== undefined) {
        currentTime = { bar: element.bar, beat: element.beat };
      } else if (element.velocity !== undefined) {
        currentVelocity = element.velocity;
        // Clear velocity range when single velocity is set
        currentVelocityMin = null;
        currentVelocityMax = null;
      } else if (element.velocityMin !== undefined && element.velocityMax !== undefined) {
        currentVelocityMin = element.velocityMin;
        currentVelocityMax = element.velocityMax;
        // Clear single velocity when range is set
        currentVelocity = null;
      } else if (element.duration !== undefined) {
        currentDuration = element.duration;
      } else if (element.probability !== undefined) {
        currentProbability = element.probability;
      } else if (element.pitch !== undefined) {
        // Convert bar:beat to absolute beats (in musical beats)
        const absoluteBeats = (currentTime.bar - 1) * beatsPerBar + (currentTime.beat - 1);

        // Convert from musical beats to Ableton beats if we have time signature
        const abletonBeats = timeSigDenominator != null ? absoluteBeats * (4 / timeSigDenominator) : absoluteBeats;

        // Determine velocity and velocity_deviation
        let velocity, velocity_deviation;
        if (currentVelocityMin !== null && currentVelocityMax !== null) {
          // Convert range to Live API format
          velocity = currentVelocityMin;
          velocity_deviation = currentVelocityMax - currentVelocityMin;
        } else {
          velocity = currentVelocity || DEFAULT_VELOCITY;
          velocity_deviation = DEFAULT_VELOCITY_DEVIATION;
        }

        events.push({
          pitch: element.pitch,
          start_time: abletonBeats,
          duration: currentDuration,
          velocity: velocity,
          probability: currentProbability,
          velocity_deviation: velocity_deviation,
        });
      }
    }

    return events;
  } catch (error) {
    if (error.name === "SyntaxError") {
      const location = error.location || {};
      const position = location.start
        ? `at position ${location.start.offset} (line ${location.start.line}, column ${location.start.column})`
        : "at unknown position";

      throw new Error(`BarBeat syntax error ${position}: ${error.message}`);
    }
    throw error;
  }
}

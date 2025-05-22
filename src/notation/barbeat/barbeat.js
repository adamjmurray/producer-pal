// src/notation/barbeat/barbeat.js
import * as parser from "./barbeat-parser";

export { BarBeatDescription as notationDescription } from "./barbeat-description";
export const DEFAULT_VELOCITY = 100;
export const DEFAULT_DURATION = 1;
export const DEFAULT_TIME = { bar: 1, beat: 1 };
export const DEFAULT_BEATS_PER_BAR = 4;

/**
 * Convert BarBeat notation to note events
 * @param {string} barBeatExpression - BarBeat notation string
 * @param {Object} options - Options
 * @param {Object} options.beatsPerBar -beats per bar in the time signature (the time signature numerator)
 * @returns {Array<{pitch: number, start_time: number, duration: number, velocity: number}>}
 */
export function parseNotation(barBeatExpression, options = {}) {
  if (!barBeatExpression) return [];

  const beatsPerBar = options.beatsPerBar || DEFAULT_BEATS_PER_BAR;

  try {
    const ast = parser.parse(barBeatExpression);

    // Process AST maintaining state
    let currentTime = DEFAULT_TIME;
    let currentVelocity = DEFAULT_VELOCITY;
    let currentDuration = DEFAULT_DURATION;

    const events = [];

    for (const element of ast) {
      if (element.bar !== undefined && element.beat !== undefined) {
        currentTime = { bar: element.bar, beat: element.beat };
      } else if (element.velocity !== undefined) {
        currentVelocity = element.velocity;
      } else if (element.duration !== undefined) {
        currentDuration = element.duration;
      } else if (element.pitch !== undefined) {
        // Convert bar:beat to absolute beats
        const absoluteBeats = (currentTime.bar - 1) * beatsPerBar + (currentTime.beat - 1);

        events.push({
          pitch: element.pitch,
          start_time: absoluteBeats,
          duration: currentDuration,
          velocity: currentVelocity,
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

/**
 * Convert Live clip notes to BarBeat string (placeholder implementation)
 * @param {Array} clipNotes - Array of note objects from the Live API
 * @param {Object} options - Formatting options
 * @returns {string} BarBeat representation
 */
export function formatNotation(clipNotes, options = {}) {
  // TODO: Implement conversion from Live API notes back to BarBeat syntax
  // This is a placeholder to maintain API compatibility
  return "";
}

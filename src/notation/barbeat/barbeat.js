// src/notation/barbeat/barbeat.js
import { midiPitchToName } from "../midi-pitch-to-name";
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
 * Convert Live clip notes to BarBeat string
 * @param {Array} clipNotes - Array of note objects from the Live API
 * @param {Object} options - Formatting options
 * @param {number} options.beatsPerBar - Beats per bar (default: 4)
 * @returns {string} BarBeat representation
 */
export function formatNotation(clipNotes, options = {}) {
  if (!clipNotes || clipNotes.length === 0) return "";

  const beatsPerBar = options.beatsPerBar || DEFAULT_BEATS_PER_BAR;

  // Sort notes by start time, then by pitch for consistent output
  const sortedNotes = [...clipNotes].sort((a, b) => {
    if (a.start_time !== b.start_time) {
      return a.start_time - b.start_time;
    }
    return a.pitch - b.pitch;
  });

  // Process each note individually to track state changes
  const elements = [];
  let currentTime = null;
  let currentVelocity = DEFAULT_VELOCITY;
  let currentDuration = DEFAULT_DURATION;

  for (const note of sortedNotes) {
    // Convert absolute beats to bar:beat
    const startTime = Math.round(note.start_time * 1000) / 1000;
    const bar = Math.floor(startTime / beatsPerBar) + 1;
    const beat = (startTime % beatsPerBar) + 1;

    // Check if we need to output time change
    const newTime = { bar, beat };
    if (!currentTime || currentTime.bar !== newTime.bar || Math.abs(currentTime.beat - newTime.beat) > 0.001) {
      // Format beat - avoid unnecessary decimals
      const beatFormatted = beat % 1 === 0 ? beat.toString() : beat.toFixed(3).replace(/\.?0+$/, "");
      elements.push(`${bar}:${beatFormatted}`);
      currentTime = newTime;
    }

    // Check velocity change
    const noteVelocity = Math.round(note.velocity);
    if (noteVelocity !== currentVelocity) {
      elements.push(`v${noteVelocity}`);
      currentVelocity = noteVelocity;
    }

    // Check duration change
    const noteDuration = note.duration;
    if (Math.abs(noteDuration - currentDuration) > 0.001) {
      // Format duration - avoid unnecessary decimals
      const durationFormatted =
        noteDuration % 1 === 0 ? noteDuration.toString() : noteDuration.toFixed(3).replace(/\.?0+$/, "");
      elements.push(`t${durationFormatted}`);
      currentDuration = noteDuration;
    }

    // Add note name
    elements.push(midiPitchToName(note.pitch));
  }

  return elements.join(" ");
}

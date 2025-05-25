// src/notation/barbeat/barbeat-format-notation.js
import { midiPitchToName } from "../midi-pitch-to-name";
import {
  DEFAULT_BEATS_PER_BAR,
  DEFAULT_DURATION,
  DEFAULT_PROBABILITY,
  DEFAULT_VELOCITY,
  DEFAULT_VELOCITY_DEVIATION,
} from "./barbeat-config";
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
  let currentProbability = DEFAULT_PROBABILITY;
  let currentVelocityDeviation = DEFAULT_VELOCITY_DEVIATION;

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

    // Check velocity/velocity range change
    const noteVelocity = Math.round(note.velocity);
    const noteVelocityDeviation = Math.round(note.velocity_deviation ?? DEFAULT_VELOCITY_DEVIATION);

    if (noteVelocityDeviation > 0) {
      // Output velocity range if deviation is present
      const velocityMin = noteVelocity;
      const velocityMax = noteVelocity + noteVelocityDeviation;
      const currentVelocityMin = currentVelocity;
      const currentVelocityMax = currentVelocity + currentVelocityDeviation;

      if (velocityMin !== currentVelocityMin || velocityMax !== currentVelocityMax) {
        elements.push(`v${velocityMin}-${velocityMax}`);
        currentVelocity = velocityMin;
        currentVelocityDeviation = noteVelocityDeviation;
      }
    } else {
      // Output single velocity if no deviation
      if (noteVelocity !== currentVelocity || currentVelocityDeviation > 0) {
        elements.push(`v${noteVelocity}`);
        currentVelocity = noteVelocity;
        currentVelocityDeviation = 0;
      }
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

    // Check probability change
    const noteProbability = note.probability ?? DEFAULT_PROBABILITY;
    if (Math.abs(noteProbability - currentProbability) > 0.001) {
      // Format probability - avoid unnecessary decimals
      const probabilityFormatted =
        noteProbability % 1 === 0 ? noteProbability.toString() : noteProbability.toFixed(3).replace(/\.?0+$/, "");
      elements.push(`p${probabilityFormatted}`);
      currentProbability = noteProbability;
    }

    // Add note name
    elements.push(midiPitchToName(note.pitch));
  }

  return elements.join(" ");
}

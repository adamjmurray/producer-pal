import { midiPitchToName } from "../midi-pitch-to-name.js";
import {
  DEFAULT_BEATS_PER_BAR,
  DEFAULT_DURATION,
  DEFAULT_PROBABILITY,
  DEFAULT_VELOCITY,
  DEFAULT_VELOCITY_DEVIATION,
} from "./barbeat-config.js";

/**
 * Format a number to remove trailing zeros
 * @param {number} value
 * @returns {string}
 */
function formatNumberWithoutTrailingZeros(value) {
  return value % 1 === 0
    ? value.toString()
    : value.toFixed(3).replace(/\.?0+$/, "");
}

/**
 * Calculate bar and beat from start time
 * @param {number} startTime
 * @param {number} beatsPerBar
 * @param {number|null} timeSigDenominator
 * @returns {{bar: number, beat: number}}
 */
function calculateBarBeat(startTime, beatsPerBar, timeSigDenominator) {
  let adjustedTime = Math.round(startTime * 1000) / 1000;
  if (timeSigDenominator != null) {
    adjustedTime = adjustedTime * (timeSigDenominator / 4);
  }
  const bar = Math.floor(adjustedTime / beatsPerBar) + 1;
  const beat = (adjustedTime % beatsPerBar) + 1;
  return { bar, beat };
}

/**
 * Check if two time positions are at the same moment
 * @param {number} bar1
 * @param {number} beat1
 * @param {number} bar2
 * @param {number} beat2
 * @returns {boolean}
 */
function isSameTimePosition(bar1, beat1, bar2, beat2) {
  return bar1 === bar2 && Math.abs(beat1 - beat2) <= 0.001;
}

/**
 * Group notes by their time position
 * @param {Array} sortedNotes
 * @param {number} beatsPerBar
 * @param {number|null} timeSigDenominator
 * @returns {Array}
 */
function groupNotesByTime(sortedNotes, beatsPerBar, timeSigDenominator) {
  const timeGroups = [];
  let currentGroup = null;

  for (const note of sortedNotes) {
    const { bar, beat } = calculateBarBeat(
      note.start_time,
      beatsPerBar,
      timeSigDenominator,
    );

    if (
      !currentGroup ||
      !isSameTimePosition(currentGroup.bar, currentGroup.beat, bar, beat)
    ) {
      currentGroup = { bar, beat, notes: [] };
      timeGroups.push(currentGroup);
    }

    currentGroup.notes.push(note);
  }

  return timeGroups;
}

/**
 * Format velocity change and update state
 * @param {number} noteVelocity
 * @param {number} noteVelocityDeviation
 * @param {number} currentVelocity
 * @param {number} currentVelocityDeviation
 * @param {Array} elements
 * @returns {{velocity: number, velocityDeviation: number}}
 */
function handleVelocityChange(
  noteVelocity,
  noteVelocityDeviation,
  currentVelocity,
  currentVelocityDeviation,
  elements,
) {
  if (noteVelocityDeviation > 0) {
    const velocityMin = noteVelocity;
    const velocityMax = noteVelocity + noteVelocityDeviation;
    const currentVelocityMin = currentVelocity;
    const currentVelocityMax = currentVelocity + currentVelocityDeviation;

    if (
      velocityMin !== currentVelocityMin ||
      velocityMax !== currentVelocityMax
    ) {
      elements.push(`v${velocityMin}-${velocityMax}`);
      return {
        velocity: velocityMin,
        velocityDeviation: noteVelocityDeviation,
      };
    }
  } else if (noteVelocity !== currentVelocity || currentVelocityDeviation > 0) {
    elements.push(`v${noteVelocity}`);
    return { velocity: noteVelocity, velocityDeviation: 0 };
  }

  return {
    velocity: currentVelocity,
    velocityDeviation: currentVelocityDeviation,
  };
}

/**
 * Format duration change and update state
 * @param {number} noteDuration
 * @param {number} currentDuration
 * @param {Array} elements
 * @returns {number}
 */
function handleDurationChange(noteDuration, currentDuration, elements) {
  if (Math.abs(noteDuration - currentDuration) > 0.001) {
    const durationFormatted = formatNumberWithoutTrailingZeros(noteDuration);
    elements.push(`t${durationFormatted}`);
    return noteDuration;
  }
  return currentDuration;
}

/**
 * Format probability change and update state
 * @param {number} noteProbability
 * @param {number} currentProbability
 * @param {Array} elements
 * @returns {number}
 */
function handleProbabilityChange(
  noteProbability,
  currentProbability,
  elements,
) {
  if (Math.abs(noteProbability - currentProbability) > 0.001) {
    const probabilityFormatted =
      formatNumberWithoutTrailingZeros(noteProbability);
    elements.push(`p${probabilityFormatted}`);
    return noteProbability;
  }
  return currentProbability;
}

/**
 * Format beat value for output
 * @param {number} beat
 * @returns {string}
 */
function formatBeat(beat) {
  return formatNumberWithoutTrailingZeros(beat);
}

/**
 * Convert Live clip notes to bar|beat string
 * @param {Array} clipNotes - Array of note objects from the Live API
 * @param {object} options - Formatting options
 * @param {number} [options.beatsPerBar] - beats per bar (legacy, prefer timeSigNumerator/timeSigDenominator)
 * @param {number} [options.timeSigNumerator] - Time signature numerator
 * @param {number} [options.timeSigDenominator] - Time signature denominator
 * @returns {string} bar|beat representation
 */
export function formatNotation(clipNotes, options = {}) {
  if (!clipNotes || clipNotes.length === 0) {
    return "";
  }

  const {
    beatsPerBar: beatsPerBarOption,
    timeSigNumerator,
    timeSigDenominator,
  } = options;
  if (
    (timeSigNumerator != null && timeSigDenominator == null) ||
    (timeSigDenominator != null && timeSigNumerator == null)
  ) {
    throw new Error(
      "Time signature must be specified with both numerator and denominator",
    );
  }
  const beatsPerBar =
    timeSigNumerator != null
      ? timeSigNumerator
      : (beatsPerBarOption ?? DEFAULT_BEATS_PER_BAR);

  // Sort notes by start time, then by pitch for consistent output
  const sortedNotes = [...clipNotes].sort((a, b) => {
    if (a.start_time !== b.start_time) {
      return a.start_time - b.start_time;
    }
    return a.pitch - b.pitch;
  });

  // Group notes by time position
  const timeGroups = groupNotesByTime(
    sortedNotes,
    beatsPerBar,
    timeSigDenominator,
  );

  // Generate output in pitch-first format
  const elements = [];
  let currentVelocity = DEFAULT_VELOCITY;
  let currentDuration = DEFAULT_DURATION;
  let currentProbability = DEFAULT_PROBABILITY;
  let currentVelocityDeviation = DEFAULT_VELOCITY_DEVIATION;

  for (const group of timeGroups) {
    // Output state changes and notes for this time position
    for (const note of group.notes) {
      // Check velocity/velocity range change
      const noteVelocity = Math.round(note.velocity);
      const noteVelocityDeviation = Math.round(
        note.velocity_deviation ?? DEFAULT_VELOCITY_DEVIATION,
      );

      const velocityState = handleVelocityChange(
        noteVelocity,
        noteVelocityDeviation,
        currentVelocity,
        currentVelocityDeviation,
        elements,
      );
      currentVelocity = velocityState.velocity;
      currentVelocityDeviation = velocityState.velocityDeviation;

      // Check duration change
      const noteDuration = note.duration;
      currentDuration = handleDurationChange(
        noteDuration,
        currentDuration,
        elements,
      );

      // Check probability change
      const noteProbability = note.probability ?? DEFAULT_PROBABILITY;
      currentProbability = handleProbabilityChange(
        noteProbability,
        currentProbability,
        elements,
      );

      // Add note name
      elements.push(midiPitchToName(note.pitch));
    }

    // Output time position after all notes for this time
    const beatFormatted = formatBeat(group.beat);
    elements.push(`${group.bar}|${beatFormatted}`);
  }

  return elements.join(" ");
}

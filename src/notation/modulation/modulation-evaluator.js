import { abletonBeatsToBarBeat } from "#src/notation/barbeat/time/barbeat-time.js";
import * as console from "#src/shared/v8-max-console.js";
import { evaluateModulationAST } from "./modulation-evaluator-helpers.js";
import * as parser from "./parser/modulation-parser.js";

/**
 * Apply modulations to a list of notes in-place
 * @param {Array<object>} notes - Array of note objects to modify
 * @param {string} modulationString - Multi-line modulation string
 * @param {number} timeSigNumerator - Time signature numerator
 * @param {number} timeSigDenominator - Time signature denominator
 */
export function applyModulations(
  notes,
  modulationString,
  timeSigNumerator,
  timeSigDenominator,
) {
  if (!modulationString || notes.length === 0) {
    return;
  }

  // Parse the modulation string once before processing notes
  let ast;

  try {
    ast = parser.parse(modulationString);
  } catch (error) {
    console.error(
      `Warning: Failed to parse modulation string: ${error.message}`,
    );

    return; // Early return - no point processing notes if parsing failed
  }

  // Calculate the overall clip timeRange in musical beats
  const clipStartTime = notes[0].start_time * (timeSigDenominator / 4);
  const lastNote = notes.at(-1);
  const clipEndTime =
    (lastNote.start_time + lastNote.duration) * (timeSigDenominator / 4);

  for (const note of notes) {
    const noteContext = buildNoteContext(
      note,
      timeSigNumerator,
      timeSigDenominator,
      clipStartTime,
      clipEndTime,
    );

    const noteProperties = buildNoteProperties(note, timeSigDenominator);

    // Evaluate modulations for this note using the pre-parsed AST
    const modulations = evaluateModulationAST(ast, noteContext, noteProperties);

    // Apply modulations with operator semantics and range clamping
    applyVelocityModulation(note, modulations);
    applyTimingModulation(note, modulations);
    applyDurationModulation(note, modulations);
    applyProbabilityModulation(note, modulations);
  }
}

/**
 * Build note context object
 * @param {object} note - Note object
 * @param {number} timeSigNumerator - Time signature numerator
 * @param {number} timeSigDenominator - Time signature denominator
 * @param {number} clipStartTime - Clip start time in musical beats
 * @param {number} clipEndTime - Clip end time in musical beats
 * @returns {object} Note context object
 */
function buildNoteContext(
  note,
  timeSigNumerator,
  timeSigDenominator,
  clipStartTime,
  clipEndTime,
) {
  // Convert note's Ableton beats start_time to musical beats position
  const musicalBeats = note.start_time * (timeSigDenominator / 4);

  // Parse bar|beat position for time range filtering
  const barBeatStr = abletonBeatsToBarBeat(
    note.start_time,
    timeSigNumerator,
    timeSigDenominator,
  );
  const barBeatMatch = barBeatStr.match(/^(\d+)\|(\d+(?:\.\d+)?)$/);
  const bar = barBeatMatch ? Number.parseInt(barBeatMatch[1]) : null;
  const beat = barBeatMatch ? Number.parseFloat(barBeatMatch[2]) : null;

  return {
    position: musicalBeats,
    pitch: note.pitch,
    bar,
    beat,
    timeSig: {
      numerator: timeSigNumerator,
      denominator: timeSigDenominator,
    },
    clipTimeRange: {
      start: clipStartTime,
      end: clipEndTime,
    },
  };
}

/**
 * Build note properties object
 * @param {object} note - Note object
 * @param {number} timeSigDenominator - Time signature denominator
 * @returns {object} Note properties object
 */
function buildNoteProperties(note, timeSigDenominator) {
  return {
    pitch: note.pitch,
    start: note.start_time * (timeSigDenominator / 4),
    velocity: note.velocity,
    velocityDeviation: note.velocity_deviation ?? 0,
    duration: note.duration,
    probability: note.probability,
  };
}

/**
 * Apply velocity modulation to a note
 * @param {object} note - Note object to modify
 * @param {object} modulations - Modulation values
 */
function applyVelocityModulation(note, modulations) {
  if (modulations.velocity == null) {
    return;
  }

  if (modulations.velocity.operator === "set") {
    note.velocity = Math.max(1, Math.min(127, modulations.velocity.value));
  } else {
    // operator === "add"
    note.velocity = Math.max(
      1,
      Math.min(127, note.velocity + modulations.velocity.value),
    );
  }
}

/**
 * Apply timing modulation to a note
 * @param {object} note - Note object to modify
 * @param {object} modulations - Modulation values
 */
function applyTimingModulation(note, modulations) {
  if (modulations.timing == null) {
    return;
  }

  // Timing modulates start_time directly (in Ableton beats)
  if (modulations.timing.operator === "set") {
    note.start_time = modulations.timing.value;
  } else {
    // operator === "add"
    note.start_time += modulations.timing.value;
  }
}

/**
 * Apply duration modulation to a note
 * @param {object} note - Note object to modify
 * @param {object} modulations - Modulation values
 */
function applyDurationModulation(note, modulations) {
  if (modulations.duration == null) {
    return;
  }

  if (modulations.duration.operator === "set") {
    note.duration = Math.max(0.001, modulations.duration.value);
  } else {
    // operator === "add"
    note.duration = Math.max(0.001, note.duration + modulations.duration.value);
  }
}

/**
 * Apply probability modulation to a note
 * @param {object} note - Note object to modify
 * @param {object} modulations - Modulation values
 */
function applyProbabilityModulation(note, modulations) {
  if (modulations.probability == null) {
    return;
  }

  if (modulations.probability.operator === "set") {
    note.probability = Math.max(
      0.0,
      Math.min(1.0, modulations.probability.value),
    );
  } else {
    // operator === "add"
    note.probability = Math.max(
      0.0,
      Math.min(1.0, note.probability + modulations.probability.value),
    );
  }
}

/**
 * Evaluate a modulation expression for a specific note context
 * @param {string} modulationString - Multi-line modulation string with optional pitch/time filters
 * @param {object} noteContext - Note context with position, pitch, and time signature
 * @param {number} noteContext.position - Note position in musical beats (0-based)
 * @param {number} [noteContext.pitch] - MIDI pitch (0-127) for pitch filtering
 * @param {number} [noteContext.bar] - Current bar number (1-based) for time range filtering
 * @param {number} [noteContext.beat] - Current beat position within bar (1-based) for time range filtering
 * @param {object} noteContext.timeSig - Time signature
 * @param {number} noteContext.timeSig.numerator - Time signature numerator
 * @param {number} noteContext.timeSig.denominator - Time signature denominator
 * @param {object} [noteContext.clipTimeRange] - Overall clip time range
 * @param {number} noteContext.clipTimeRange.start - Clip start time in musical beats
 * @param {number} noteContext.clipTimeRange.end - Clip end time in musical beats
 * @param {object} [noteProperties] - Note properties accessible via note.* variables
 * @param {number} [noteProperties.pitch] - MIDI pitch (0-127)
 * @param {number} [noteProperties.start] - Start time in musical beats
 * @param {number} [noteProperties.velocity] - Velocity (1-127)
 * @param {number} [noteProperties.velocityDeviation] - Velocity deviation
 * @param {number} [noteProperties.duration] - Duration in beats
 * @param {number} [noteProperties.probability] - Probability (0.0-1.0)
 * @returns {object} Modulation values with operators, e.g., {velocity: {operator: "add", value: 10}}
 */
export function evaluateModulation(
  modulationString,
  noteContext,
  noteProperties,
) {
  if (!modulationString) {
    return {};
  }

  let ast;

  try {
    ast = parser.parse(modulationString);
  } catch (error) {
    console.error(
      `Warning: Failed to parse modulation string: ${error.message}`,
    );

    return {};
  }

  return evaluateModulationAST(ast, noteContext, noteProperties);
}

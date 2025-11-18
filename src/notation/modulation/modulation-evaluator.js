import * as console from "../../shared/v8-max-console";
import {
  abletonBeatsToBarBeat,
  barBeatToBeats,
} from "../barbeat/barbeat-time.js";
import { parseFrequency } from "./modulation-frequency.js";
import * as parser from "./modulation-parser.js";
import * as waveforms from "./modulation-waveforms.js";

/**
 * Apply modulations to a list of notes in-place
 * @param {Array<Object>} notes - Array of note objects to modify
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
  const lastNote = notes[notes.length - 1];
  const clipEndTime =
    (lastNote.start_time + lastNote.duration) * (timeSigDenominator / 4);

  for (const note of notes) {
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

    // Prepare note properties for variable access
    const noteProperties = {
      pitch: note.pitch,
      start: musicalBeats,
      velocity: note.velocity,
      velocityDeviation: note.velocity_deviation ?? 0,
      duration: note.duration,
      probability: note.probability,
    };

    // Evaluate modulations for this note using the pre-parsed AST
    const modulations = evaluateModulationAST(
      ast,
      {
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
      },
      noteProperties,
    );

    // Apply modulations with operator semantics and range clamping
    if (modulations.velocity != null) {
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

    if (modulations.timing != null) {
      // Timing modulates start_time directly (in Ableton beats)
      if (modulations.timing.operator === "set") {
        note.start_time = modulations.timing.value;
      } else {
        // operator === "add"
        note.start_time += modulations.timing.value;
      }
    }

    if (modulations.duration != null) {
      if (modulations.duration.operator === "set") {
        note.duration = Math.max(0.001, modulations.duration.value);
      } else {
        // operator === "add"
        note.duration = Math.max(
          0.001,
          note.duration + modulations.duration.value,
        );
      }
    }

    if (modulations.probability != null) {
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
  }
}

/**
 * Evaluate a modulation expression for a specific note context
 * @param {string} modulationString - Multi-line modulation string with optional pitch/time filters
 * @param {Object} noteContext - Note context with position, pitch, and time signature
 * @param {number} noteContext.position - Note position in musical beats (0-based)
 * @param {number} [noteContext.pitch] - MIDI pitch (0-127) for pitch filtering
 * @param {number} [noteContext.bar] - Current bar number (1-based) for time range filtering
 * @param {number} [noteContext.beat] - Current beat position within bar (1-based) for time range filtering
 * @param {Object} noteContext.timeSig - Time signature
 * @param {number} noteContext.timeSig.numerator - Time signature numerator
 * @param {number} noteContext.timeSig.denominator - Time signature denominator
 * @param {Object} [noteContext.clipTimeRange] - Overall clip time range
 * @param {number} noteContext.clipTimeRange.start - Clip start time in musical beats
 * @param {number} noteContext.clipTimeRange.end - Clip end time in musical beats
 * @param {Object} [noteProperties] - Note properties accessible via note.* variables
 * @param {number} [noteProperties.pitch] - MIDI pitch (0-127)
 * @param {number} [noteProperties.start] - Start time in musical beats
 * @param {number} [noteProperties.velocity] - Velocity (1-127)
 * @param {number} [noteProperties.velocityDeviation] - Velocity deviation
 * @param {number} [noteProperties.duration] - Duration in beats
 * @param {number} [noteProperties.probability] - Probability (0.0-1.0)
 * @returns {Object} Modulation values with operators, e.g., {velocity: {operator: "add", value: 10}}
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

/**
 * Evaluate a pre-parsed modulation AST for a specific note context
 * @param {Array} ast - Parsed modulation AST
 * @param {Object} noteContext - Note context with position, pitch, and time signature
 * @param {number} noteContext.position - Note position in musical beats (0-based)
 * @param {number} [noteContext.pitch] - MIDI pitch (0-127) for pitch filtering
 * @param {number} [noteContext.bar] - Current bar number (1-based) for time range filtering
 * @param {number} [noteContext.beat] - Current beat position within bar (1-based) for time range filtering
 * @param {Object} noteContext.timeSig - Time signature
 * @param {number} noteContext.timeSig.numerator - Time signature numerator
 * @param {number} noteContext.timeSig.denominator - Time signature denominator
 * @param {Object} [noteContext.clipTimeRange] - Overall clip time range
 * @param {number} noteContext.clipTimeRange.start - Clip start time in musical beats
 * @param {number} noteContext.clipTimeRange.end - Clip end time in musical beats
 * @param {Object} [noteProperties] - Note properties accessible via note.* variables
 * @param {number} [noteProperties.pitch] - MIDI pitch (0-127)
 * @param {number} [noteProperties.start] - Start time in musical beats
 * @param {number} [noteProperties.velocity] - Velocity (1-127)
 * @param {number} [noteProperties.velocityDeviation] - Velocity deviation
 * @param {number} [noteProperties.duration] - Duration in beats
 * @param {number} [noteProperties.probability] - Probability (0.0-1.0)
 * @returns {Object} Modulation values with operators, e.g., {velocity: {operator: "add", value: 10}}
 */
function evaluateModulationAST(ast, noteContext, noteProperties = {}) {
  const { position, pitch, bar, beat, timeSig, clipTimeRange } = noteContext;
  const { numerator, denominator } = timeSig;

  const result = {};
  let currentPitchRange = null; // Track persistent pitch range context

  for (const assignment of ast) {
    try {
      // Update persistent pitch range context if specified
      if (assignment.pitchRange != null) {
        currentPitchRange = assignment.pitchRange;
      }

      // Apply pitch filtering
      if (currentPitchRange != null && pitch != null) {
        const { startPitch, endPitch } = currentPitchRange;
        if (pitch < startPitch || pitch > endPitch) {
          continue; // Skip this assignment - note's pitch outside range
        }
      }

      // Calculate the active timeRange for this assignment
      let activeTimeRange;
      if (assignment.timeRange && bar != null && beat != null) {
        const { startBar, startBeat, endBar, endBeat } = assignment.timeRange;

        // Check if note is within the time range
        const afterStart =
          bar > startBar || (bar === startBar && beat >= startBeat);
        const beforeEnd = bar < endBar || (bar === endBar && beat <= endBeat);

        if (!(afterStart && beforeEnd)) {
          continue; // Skip this assignment - note outside time range
        }

        // Convert assignment timeRange to musical beats
        const musicalBeatsPerBar = numerator * (4 / denominator);
        const startBeats = barBeatToBeats(
          `${startBar}|${startBeat}`,
          musicalBeatsPerBar,
        );
        const endBeats = barBeatToBeats(
          `${endBar}|${endBeat}`,
          musicalBeatsPerBar,
        );
        activeTimeRange = { start: startBeats, end: endBeats };
      } else {
        // No assignment timeRange, use clip timeRange
        activeTimeRange = clipTimeRange || { start: 0, end: position };
      }

      const value = evaluateExpression(
        assignment.expression,
        position,
        numerator,
        denominator,
        activeTimeRange,
        noteProperties,
      );

      result[assignment.parameter] = {
        operator: assignment.operator,
        value,
      };
    } catch (error) {
      console.error(
        `Warning: Failed to evaluate modulation for parameter "${assignment.parameter}": ${error.message}`,
      );
      // Continue with other parameters
    }
  }

  return result;
}

/**
 * Evaluate an expression AST node
 * @param {*} node - Expression AST node
 * @param {number} position - Note position in musical beats
 * @param {number} timeSigNumerator - Time signature numerator
 * @param {number} timeSigDenominator - Time signature denominator
 * @param {Object} timeRange - Active time range for this expression
 * @param {number} timeRange.start - Start time in musical beats
 * @param {number} timeRange.end - End time in musical beats
 * @param {Object} [noteProperties] - Note properties accessible via note.* variables
 * @returns {number} Evaluated value
 */
function evaluateExpression(
  node,
  position,
  timeSigNumerator,
  timeSigDenominator,
  timeRange,
  noteProperties = {},
) {
  // Base case: number literal
  if (typeof node === "number") {
    return node;
  }

  // Variable lookup
  if (node.type === "variable") {
    if (noteProperties[node.name] == null) {
      throw new Error(
        `Variable "note.${node.name}" is not available in this context`,
      );
    }
    return noteProperties[node.name];
  }

  // Arithmetic operators
  if (node.type === "add") {
    const left = evaluateExpression(
      node.left,
      position,
      timeSigNumerator,
      timeSigDenominator,
      timeRange,
      noteProperties,
    );
    const right = evaluateExpression(
      node.right,
      position,
      timeSigNumerator,
      timeSigDenominator,
      timeRange,
      noteProperties,
    );
    return left + right;
  }

  if (node.type === "subtract") {
    const left = evaluateExpression(
      node.left,
      position,
      timeSigNumerator,
      timeSigDenominator,
      timeRange,
      noteProperties,
    );
    const right = evaluateExpression(
      node.right,
      position,
      timeSigNumerator,
      timeSigDenominator,
      timeRange,
      noteProperties,
    );
    return left - right;
  }

  if (node.type === "multiply") {
    const left = evaluateExpression(
      node.left,
      position,
      timeSigNumerator,
      timeSigDenominator,
      timeRange,
      noteProperties,
    );
    const right = evaluateExpression(
      node.right,
      position,
      timeSigNumerator,
      timeSigDenominator,
      timeRange,
      noteProperties,
    );
    return left * right;
  }

  if (node.type === "divide") {
    const left = evaluateExpression(
      node.left,
      position,
      timeSigNumerator,
      timeSigDenominator,
      timeRange,
      noteProperties,
    );
    const right = evaluateExpression(
      node.right,
      position,
      timeSigNumerator,
      timeSigDenominator,
      timeRange,
      noteProperties,
    );
    // Division by zero yields 0 per spec
    if (right === 0) {
      return 0;
    }
    return left / right;
  }

  // Function calls
  if (node.type === "function") {
    return evaluateFunction(
      node.name,
      node.args,
      position,
      timeSigNumerator,
      timeSigDenominator,
      timeRange,
      noteProperties,
    );
  }

  throw new Error(`Unknown expression node type: ${node.type}`);
}

/**
 * Evaluate a function call
 * @param {string} name - Function name
 * @param {Array} args - Function arguments (AST nodes)
 * @param {number} position - Note position in musical beats
 * @param {number} timeSigNumerator - Time signature numerator
 * @param {number} timeSigDenominator - Time signature denominator
 * @param {Object} timeRange - Active time range for this expression
 * @param {Object} [noteProperties] - Note properties accessible via note.* variables
 * @returns {number} Function result
 */
function evaluateFunction(
  name,
  args,
  position,
  timeSigNumerator,
  timeSigDenominator,
  timeRange,
  noteProperties = {},
) {
  // noise() has no arguments
  if (name === "noise") {
    return waveforms.noise();
  }

  // ramp() is special - it uses timeRange instead of period
  if (name === "ramp") {
    // ramp() requires start and end arguments
    if (args.length < 2) {
      throw new Error(
        `Function ramp() requires start and end arguments: ramp(start, end, speed?)`,
      );
    }

    // First argument: start value
    const start = evaluateExpression(
      args[0],
      position,
      timeSigNumerator,
      timeSigDenominator,
      timeRange,
      noteProperties,
    );

    // Second argument: end value
    const end = evaluateExpression(
      args[1],
      position,
      timeSigNumerator,
      timeSigDenominator,
      timeRange,
      noteProperties,
    );

    // Optional third argument: speed (default 1)
    let speed = 1;
    if (args.length >= 3) {
      speed = evaluateExpression(
        args[2],
        position,
        timeSigNumerator,
        timeSigDenominator,
        timeRange,
        noteProperties,
      );
      if (speed <= 0) {
        throw new Error(`Function ramp() speed must be > 0, got ${speed}`);
      }
    }

    // Calculate phase based on position within timeRange
    const timeRangeDuration = timeRange.end - timeRange.start;
    const phase =
      timeRangeDuration > 0
        ? (position - timeRange.start) / timeRangeDuration
        : 0;

    return waveforms.ramp(phase, start, end, speed);
  }

  // All other waveforms require at least a period argument
  if (args.length === 0) {
    throw new Error(`Function ${name}() requires at least a period argument`);
  }

  // First argument is period (either period type with "t" suffix, or a number expression)
  const periodArg = args[0];
  let period;

  if (periodArg.type === "period") {
    period = parseFrequency(periodArg, timeSigNumerator, timeSigDenominator);
  } else {
    // Evaluate as expression (e.g., variable or number) - treated as beats
    period = evaluateExpression(
      periodArg,
      position,
      timeSigNumerator,
      timeSigDenominator,
      timeRange,
      noteProperties,
    );
    if (period <= 0) {
      throw new Error(`Function ${name}() period must be > 0, got ${period}`);
    }
  }

  // Calculate phase from position and period
  const basePhase = (position / period) % 1.0;

  // Optional second argument: phase offset
  let phaseOffset = 0;
  if (args.length >= 2) {
    phaseOffset = evaluateExpression(
      args[1],
      position,
      timeSigNumerator,
      timeSigDenominator,
      timeRange,
      noteProperties,
    );
  }

  const phase = basePhase + phaseOffset;

  // Call the waveform function
  switch (name) {
    case "cos":
      return waveforms.cos(phase);

    case "tri":
      return waveforms.tri(phase);

    case "saw":
      return waveforms.saw(phase);

    case "square": {
      // Optional third argument: pulseWidth
      let pulseWidth = 0.5; // default
      if (args.length >= 3) {
        pulseWidth = evaluateExpression(
          args[2],
          position,
          timeSigNumerator,
          timeSigDenominator,
          timeRange,
          noteProperties,
        );
      }
      return waveforms.square(phase, pulseWidth);
    }

    default:
      throw new Error(`Unknown waveform function: ${name}()`);
  }
}

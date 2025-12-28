import * as console from "#src/shared/v8-max-console.js";
import { barBeatToBeats } from "../barbeat/time/barbeat-time.js";
import { evaluateFunction } from "./modulation-functions.js";

/**
 * Evaluate a pre-parsed modulation AST for a specific note context
 * @param {Array} ast - Parsed modulation AST
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
export function evaluateModulationAST(ast, noteContext, noteProperties = {}) {
  const { position, pitch, bar, beat, timeSig, clipTimeRange } = noteContext;
  const { numerator, denominator } = timeSig;

  const result = {};
  let currentPitchRange = null; // Track persistent pitch range context

  for (const assignment of ast) {
    const assignmentResult = processAssignment(
      assignment,
      position,
      pitch,
      bar,
      beat,
      numerator,
      denominator,
      clipTimeRange,
      noteProperties,
      currentPitchRange,
    );

    if (assignmentResult.skip) {
      continue;
    }

    if (assignmentResult.pitchRange != null) {
      currentPitchRange = assignmentResult.pitchRange;
    }

    if (assignmentResult.value != null) {
      result[assignment.parameter] = {
        operator: assignment.operator,
        value: assignmentResult.value,
      };
    }
  }

  return result;
}

/**
 * Process a single modulation assignment
 * @param {object} assignment - Assignment node from AST
 * @param {number} position - Note position in musical beats
 * @param {number} pitch - MIDI pitch
 * @param {number} bar - Current bar number
 * @param {number} beat - Current beat position
 * @param {number} numerator - Time signature numerator
 * @param {number} denominator - Time signature denominator
 * @param {object} clipTimeRange - Clip time range
 * @param {object} noteProperties - Note properties
 * @param {object} currentPitchRange - Current pitch range context
 * @returns {object} Result object with skip flag and optional value
 */
function processAssignment(
  assignment,
  position,
  pitch,
  bar,
  beat,
  numerator,
  denominator,
  clipTimeRange,
  noteProperties,
  currentPitchRange,
) {
  try {
    // Update persistent pitch range context if specified
    let pitchRange = null;

    if (assignment.pitchRange != null) {
      pitchRange = assignment.pitchRange;
      currentPitchRange = pitchRange;
    }

    // Apply pitch filtering
    if (currentPitchRange != null && pitch != null) {
      const { startPitch, endPitch } = currentPitchRange;

      if (pitch < startPitch || pitch > endPitch) {
        return { skip: true }; // Skip this assignment - note's pitch outside range
      }
    }

    // Calculate the active timeRange for this assignment
    const activeTimeRange = calculateActiveTimeRange(
      assignment,
      bar,
      beat,
      numerator,
      denominator,
      clipTimeRange,
      position,
    );

    if (activeTimeRange.skip) {
      return { skip: true };
    }

    const value = evaluateExpression(
      assignment.expression,
      position,
      numerator,
      denominator,
      activeTimeRange.timeRange,
      noteProperties,
    );

    return { value, pitchRange };
  } catch (error) {
    console.error(
      `Warning: Failed to evaluate modulation for parameter "${assignment.parameter}": ${error.message}`,
    );

    return { skip: true };
  }
}

/**
 * Calculate active time range for an assignment
 * @param {object} assignment - Assignment node
 * @param {number} bar - Current bar number
 * @param {number} beat - Current beat position
 * @param {number} numerator - Time signature numerator
 * @param {number} denominator - Time signature denominator
 * @param {object} clipTimeRange - Clip time range
 * @param {number} position - Note position
 * @returns {object} Result with timeRange or skip flag
 */
function calculateActiveTimeRange(
  assignment,
  bar,
  beat,
  numerator,
  denominator,
  clipTimeRange,
  position,
) {
  if (assignment.timeRange && bar != null && beat != null) {
    const { startBar, startBeat, endBar, endBeat } = assignment.timeRange;

    // Check if note is within the time range
    const afterStart =
      bar > startBar || (bar === startBar && beat >= startBeat);
    const beforeEnd = bar < endBar || (bar === endBar && beat <= endBeat);

    if (!(afterStart && beforeEnd)) {
      return { skip: true }; // Skip this assignment - note outside time range
    }

    // Convert assignment timeRange to musical beats
    const musicalBeatsPerBar = numerator * (4 / denominator);
    const startBeats = barBeatToBeats(
      `${startBar}|${startBeat}`,
      musicalBeatsPerBar,
    );
    const endBeats = barBeatToBeats(`${endBar}|${endBeat}`, musicalBeatsPerBar);

    return { timeRange: { start: startBeats, end: endBeats } };
  }

  // No assignment timeRange, use clip timeRange
  return {
    timeRange: clipTimeRange || { start: 0, end: position },
  };
}

/**
 * Evaluate an expression AST node
 * @param {*} node - Expression AST node
 * @param {number} position - Note position in musical beats
 * @param {number} timeSigNumerator - Time signature numerator
 * @param {number} timeSigDenominator - Time signature denominator
 * @param {object} timeRange - Active time range for this expression
 * @param {number} timeRange.start - Start time in musical beats
 * @param {number} timeRange.end - End time in musical beats
 * @param {object} [noteProperties] - Note properties accessible via note.* variables
 * @returns {number} Evaluated value
 */
export function evaluateExpression(
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
    return (
      evaluateExpression(
        node.left,
        position,
        timeSigNumerator,
        timeSigDenominator,
        timeRange,
        noteProperties,
      ) +
      evaluateExpression(
        node.right,
        position,
        timeSigNumerator,
        timeSigDenominator,
        timeRange,
        noteProperties,
      )
    );
  }

  if (node.type === "subtract") {
    return (
      evaluateExpression(
        node.left,
        position,
        timeSigNumerator,
        timeSigDenominator,
        timeRange,
        noteProperties,
      ) -
      evaluateExpression(
        node.right,
        position,
        timeSigNumerator,
        timeSigDenominator,
        timeRange,
        noteProperties,
      )
    );
  }

  if (node.type === "multiply") {
    return (
      evaluateExpression(
        node.left,
        position,
        timeSigNumerator,
        timeSigDenominator,
        timeRange,
        noteProperties,
      ) *
      evaluateExpression(
        node.right,
        position,
        timeSigNumerator,
        timeSigDenominator,
        timeRange,
        noteProperties,
      )
    );
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
      evaluateExpression,
    );
  }

  throw new Error(`Unknown expression node type: ${node.type}`);
}

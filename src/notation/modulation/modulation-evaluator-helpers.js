import { barBeatToBeats } from "#src/notation/barbeat/time/barbeat-time.js";
import { errorMessage } from "#src/shared/error-utils.js";
import * as console from "#src/shared/v8-max-console.js";
import { evaluateFunction } from "./modulation-functions.js";

/**
 * @typedef {object} TimeRange
 * @property {number} start - Start time in musical beats
 * @property {number} end - End time in musical beats
 */

/**
 * @typedef {object} TimeSig
 * @property {number} numerator - Time signature numerator
 * @property {number} denominator - Time signature denominator
 */

/**
 * @typedef {object} NoteContext
 * @property {number} position - Note position in musical beats (0-based)
 * @property {number} [pitch] - MIDI pitch (0-127) for pitch filtering
 * @property {number} [bar] - Current bar number (1-based) for time range filtering
 * @property {number} [beat] - Current beat position within bar (1-based) for time range filtering
 * @property {TimeSig} timeSig - Time signature
 * @property {TimeRange} [clipTimeRange] - Overall clip time range
 */

/**
 * @typedef {object} NoteProperties
 * @property {number} [pitch] - MIDI pitch (0-127)
 * @property {number} [start] - Start time in musical beats
 * @property {number} [velocity] - Velocity (1-127)
 * @property {number} [velocityDeviation] - Velocity deviation
 * @property {number} [duration] - Duration in beats
 * @property {number} [probability] - Probability (0.0-1.0)
 */

/**
 * @typedef {object} PitchRange
 * @property {number} startPitch - Start MIDI pitch
 * @property {number} endPitch - End MIDI pitch
 */

/**
 * @typedef {object} ModulationAssignment
 * @property {string} parameter - Target parameter name
 * @property {string} operator - Operator ('add' or 'set')
 * @property {ExpressionNode} expression - Expression to evaluate
 * @property {PitchRange} [pitchRange] - Optional pitch range filter
 * @property {{ startBar: number, startBeat: number, endBar: number, endBeat: number }} [timeRange] - Optional time range filter
 */

/**
 * Expression AST node can be:
 * - number literal
 * - variable node: {type: "variable", name: string}
 * - binary op node: {type: "add"|"subtract"|"multiply"|"divide", left: ExpressionNode, right: ExpressionNode}
 * - function node: {type: "function", name: string, args: Array<ExpressionNode>}
 * @typedef {number | VariableNode | BinaryOpNode | FunctionNode} ExpressionNode
 */

/**
 * @typedef {{ type: "variable", name: string }} VariableNode
 */

/**
 * @typedef {{ type: "add" | "subtract" | "multiply" | "divide", left: ExpressionNode, right: ExpressionNode }} BinaryOpNode
 */

/**
 * @typedef {{ type: "function", name: string, args: Array<ExpressionNode> }} FunctionNode
 */

/**
 * @typedef {object} ModulationResult
 * @property {string} operator - Operator ('add' or 'set')
 * @property {number} value - Evaluated value
 */

/**
 * Evaluate a pre-parsed modulation AST for a specific note context
 * @param {Array<ModulationAssignment>} ast - Parsed modulation AST
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
 * @param {NoteProperties} [noteProperties] - Note properties accessible via note.* variables
 * @returns {Record<string, ModulationResult>} Modulation values with operators, e.g., {velocity: {operator: "add", value: 10}}
 */
export function evaluateModulationAST(ast, noteContext, noteProperties = {}) {
  const { position, pitch, bar, beat, timeSig, clipTimeRange } = noteContext;
  const { numerator, denominator } = timeSig;

  /** @type {Record<string, ModulationResult>} */
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
 * @param {ModulationAssignment} assignment - Assignment node from AST
 * @param {number} position - Note position in musical beats
 * @param {number | undefined} pitch - MIDI pitch
 * @param {number | null | undefined} bar - Current bar number
 * @param {number | null | undefined} beat - Current beat position
 * @param {number} numerator - Time signature numerator
 * @param {number} denominator - Time signature denominator
 * @param {TimeRange | undefined} clipTimeRange - Clip time range
 * @param {NoteProperties} noteProperties - Note properties
 * @param {PitchRange | null} currentPitchRange - Current pitch range context
 * @returns {{ skip: true } | { skip?: false, value: number, pitchRange: PitchRange | null }} Result object with skip flag and optional value
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
      `Warning: Failed to evaluate modulation for parameter "${assignment.parameter}": ${errorMessage(error)}`,
    );

    return { skip: true };
  }
}

/**
 * Calculate active time range for an assignment
 * @param {ModulationAssignment} assignment - Assignment node
 * @param {number | null | undefined} bar - Current bar number
 * @param {number | null | undefined} beat - Current beat position
 * @param {number} numerator - Time signature numerator
 * @param {number} denominator - Time signature denominator
 * @param {TimeRange | undefined} clipTimeRange - Clip time range
 * @param {number} position - Note position
 * @returns {{ skip: true } | { skip?: false, timeRange: TimeRange }} Result with timeRange or skip flag
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
 * @param {ExpressionNode} node - Expression AST node
 * @param {number} position - Note position in musical beats
 * @param {number} timeSigNumerator - Time signature numerator
 * @param {number} timeSigDenominator - Time signature denominator
 * @param {TimeRange} timeRange - Active time range for this expression
 * @param {NoteProperties} [noteProperties] - Note properties accessible via note.* variables
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

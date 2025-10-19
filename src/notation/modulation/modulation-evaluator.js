import * as parser from "./modulation-parser.js";
import * as waveforms from "./modulation-waveforms.js";
import { parseFrequency } from "./modulation-frequency.js";

/**
 * Evaluate a modulation expression for a specific note context
 * @param {string} modulationString - Multi-line modulation string (parameter: expression format)
 * @param {Object} noteContext - Note context with position and time signature
 * @param {number} noteContext.position - Note position in musical beats (0-based)
 * @param {Object} noteContext.timeSig - Time signature
 * @param {number} noteContext.timeSig.numerator - Time signature numerator
 * @param {number} noteContext.timeSig.denominator - Time signature denominator
 * @returns {Object} Modulation values by parameter name, e.g., {velocity: 10, timing: 0.05}
 */
export function evaluateModulation(modulationString, noteContext) {
  if (!modulationString) {
    return {};
  }

  const { position, timeSig } = noteContext;
  const { numerator, denominator } = timeSig;

  let ast;
  try {
    ast = parser.parse(modulationString);
  } catch (error) {
    console.error(
      `Warning: Failed to parse modulation string: ${error.message}`,
    );
    return {};
  }

  const result = {};

  for (const assignment of ast) {
    try {
      const value = evaluateExpression(
        assignment.expression,
        position,
        numerator,
        denominator,
      );
      result[assignment.parameter] = value;
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
 * @returns {number} Evaluated value
 */
function evaluateExpression(
  node,
  position,
  timeSigNumerator,
  timeSigDenominator,
) {
  // Base case: number literal
  if (typeof node === "number") {
    return node;
  }

  // Arithmetic operators
  if (node.type === "add") {
    const left = evaluateExpression(
      node.left,
      position,
      timeSigNumerator,
      timeSigDenominator,
    );
    const right = evaluateExpression(
      node.right,
      position,
      timeSigNumerator,
      timeSigDenominator,
    );
    return left + right;
  }

  if (node.type === "subtract") {
    const left = evaluateExpression(
      node.left,
      position,
      timeSigNumerator,
      timeSigDenominator,
    );
    const right = evaluateExpression(
      node.right,
      position,
      timeSigNumerator,
      timeSigDenominator,
    );
    return left - right;
  }

  if (node.type === "multiply") {
    const left = evaluateExpression(
      node.left,
      position,
      timeSigNumerator,
      timeSigDenominator,
    );
    const right = evaluateExpression(
      node.right,
      position,
      timeSigNumerator,
      timeSigDenominator,
    );
    return left * right;
  }

  if (node.type === "divide") {
    const left = evaluateExpression(
      node.left,
      position,
      timeSigNumerator,
      timeSigDenominator,
    );
    const right = evaluateExpression(
      node.right,
      position,
      timeSigNumerator,
      timeSigDenominator,
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
 * @returns {number} Function result
 */
function evaluateFunction(
  name,
  args,
  position,
  timeSigNumerator,
  timeSigDenominator,
) {
  // noise() has no arguments
  if (name === "noise") {
    return waveforms.noise();
  }

  // All other waveforms require at least a frequency argument
  if (args.length === 0) {
    throw new Error(
      `Function ${name}() requires at least a frequency argument`,
    );
  }

  // First argument is frequency
  const freqArg = args[0];
  let period;

  if (freqArg.type === "frequency") {
    period = parseFrequency(freqArg, timeSigNumerator, timeSigDenominator);
  } else {
    throw new Error(
      `First argument to ${name}() must be a frequency (e.g., 1t, 1:0t)`,
    );
  }

  // Calculate phase from position and period
  let basePhase = (position / period) % 1.0;

  // Optional second argument: phase offset
  let phaseOffset = 0;
  if (args.length >= 2) {
    phaseOffset = evaluateExpression(
      args[1],
      position,
      timeSigNumerator,
      timeSigDenominator,
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
        );
      }
      return waveforms.square(phase, pulseWidth);
    }

    default:
      throw new Error(`Unknown waveform function: ${name}()`);
  }
}

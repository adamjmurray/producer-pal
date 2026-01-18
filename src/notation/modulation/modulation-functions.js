import { parseFrequency } from "./modulation-frequency.js";
import * as waveforms from "./modulation-waveforms.js";

/**
 * Evaluate a function call
 * @param {string} name - Function name
 * @param {Array} args - Function arguments (AST nodes)
 * @param {number} position - Note position in musical beats
 * @param {number} timeSigNumerator - Time signature numerator
 * @param {number} timeSigDenominator - Time signature denominator
 * @param {object} timeRange - Active time range for this expression
 * @param {object} noteProperties - Note properties accessible via note.* variables
 * @param {Function} evaluateExpression - Function to evaluate expressions
 * @returns {number} Function result
 */
export function evaluateFunction(
  name,
  args,
  position,
  timeSigNumerator,
  timeSigDenominator,
  timeRange,
  noteProperties,
  evaluateExpression,
) {
  // noise() has no arguments
  if (name === "noise") {
    return waveforms.noise();
  }

  // ramp() is special - it uses timeRange instead of period
  if (name === "ramp") {
    return evaluateRamp(
      args,
      position,
      timeSigNumerator,
      timeSigDenominator,
      timeRange,
      noteProperties,
      evaluateExpression,
    );
  }

  // All other waveforms require at least a period argument
  return evaluateWaveform(
    name,
    args,
    position,
    timeSigNumerator,
    timeSigDenominator,
    timeRange,
    noteProperties,
    evaluateExpression,
  );
}

/**
 * Evaluate ramp function
 * @param {Array} args - Function arguments
 * @param {number} position - Note position in musical beats
 * @param {number} timeSigNumerator - Time signature numerator
 * @param {number} timeSigDenominator - Time signature denominator
 * @param {object} timeRange - Active time range
 * @param {object} noteProperties - Note properties
 * @param {Function} evaluateExpression - Function to evaluate expressions
 * @returns {number} Ramp value
 */
function evaluateRamp(
  args,
  position,
  timeSigNumerator,
  timeSigDenominator,
  timeRange,
  noteProperties,
  evaluateExpression,
) {
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

/**
 * Evaluate waveform function (cos, tri, saw, square)
 * @param {string} name - Function name
 * @param {Array} args - Function arguments
 * @param {number} position - Note position in musical beats
 * @param {number} timeSigNumerator - Time signature numerator
 * @param {number} timeSigDenominator - Time signature denominator
 * @param {object} timeRange - Active time range
 * @param {object} noteProperties - Note properties
 * @param {Function} evaluateExpression - Function to evaluate expressions
 * @returns {number} Waveform value
 */
function evaluateWaveform(
  name,
  args,
  position,
  timeSigNumerator,
  timeSigDenominator,
  timeRange,
  noteProperties,
  evaluateExpression,
) {
  // All waveforms require at least a period argument
  if (args.length === 0) {
    throw new Error(`Function ${name}() requires at least a period argument`);
  }

  // First argument is period (either period type with "t" suffix, or a number expression)
  const period = parsePeriod(
    args[0],
    position,
    timeSigNumerator,
    timeSigDenominator,
    timeRange,
    noteProperties,
    evaluateExpression,
    name,
  );

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

/**
 * Parse period argument for waveform functions
 * @param {object} periodArg - Period argument node
 * @param {number} position - Note position
 * @param {number} timeSigNumerator - Time signature numerator
 * @param {number} timeSigDenominator - Time signature denominator
 * @param {object} timeRange - Time range
 * @param {object} noteProperties - Note properties
 * @param {Function} evaluateExpression - Function to evaluate expressions
 * @param {string} name - Function name
 * @returns {number} Period in beats
 */
function parsePeriod(
  periodArg,
  position,
  timeSigNumerator,
  timeSigDenominator,
  timeRange,
  noteProperties,
  evaluateExpression,
  name,
) {
  let period;

  if (periodArg.type === "period") {
    period = parseFrequency(periodArg, timeSigNumerator);
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

  return period;
}

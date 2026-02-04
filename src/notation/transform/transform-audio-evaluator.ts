import { errorMessage } from "#src/shared/error-utils.ts";
import * as console from "#src/shared/v8-max-console.ts";
import type {
  ExpressionNode,
  TransformAssignment,
} from "./parser/transform-parser.ts";
import * as parser from "./parser/transform-parser.ts";
import { evaluateFunction } from "./transform-functions.ts";

// Constants for gain clamping
const MIN_GAIN_DB = -70;
const MAX_GAIN_DB = 24;

// MIDI-only parameters that should be skipped for audio clips
const MIDI_PARAMETERS = new Set([
  "velocity",
  "timing",
  "duration",
  "probability",
  "deviation",
]);

export interface AudioProperties {
  gain: number;
}

/**
 * Apply gain transform to an audio clip
 * @param currentGainDb - Current gain in dB
 * @param transformString - Transform expression string
 * @returns New gain in dB, or null if no gain transform applied
 */
export function applyAudioTransform(
  currentGainDb: number,
  transformString: string | undefined,
): number | null {
  if (!transformString) {
    return null;
  }

  let ast: TransformAssignment[];

  try {
    ast = parser.parse(transformString);
  } catch (error) {
    console.warn(`Failed to parse transform string: ${errorMessage(error)}`);

    return null;
  }

  // Check for MIDI parameters and warn
  const hasMidiParams = ast.some((a) => MIDI_PARAMETERS.has(a.parameter));

  if (hasMidiParams) {
    console.warn(
      "MIDI parameters (velocity, timing, duration, probability, deviation) ignored for audio clips",
    );
  }

  // Filter to gain-only assignments
  const gainAssignments = ast.filter((a) => a.parameter === "gain");

  if (gainAssignments.length === 0) {
    return null;
  }

  // Build audio properties for variable access
  const audioProperties: AudioProperties = { gain: currentGainDb };

  let newGainDb = currentGainDb;

  for (const assignment of gainAssignments) {
    try {
      const value = evaluateAudioExpression(
        assignment.expression,
        audioProperties,
      );

      if (assignment.operator === "set") {
        newGainDb = value;
      } else {
        // operator === "add"
        newGainDb += value;
      }

      // Update for subsequent transforms
      audioProperties.gain = newGainDb;
    } catch (error) {
      console.warn(`Failed to evaluate gain transform: ${errorMessage(error)}`);
    }
  }

  // Clamp to valid range
  return Math.max(MIN_GAIN_DB, Math.min(MAX_GAIN_DB, newGainDb));
}

type BinaryOpNode = {
  type: "add" | "subtract" | "multiply" | "divide";
  left: ExpressionNode;
  right: ExpressionNode;
};

/**
 * Evaluate an expression in audio context
 * @param node - Expression node to evaluate
 * @param audioProperties - Audio properties for variable access
 * @returns Evaluated numeric result
 */
function evaluateAudioExpression(
  node: ExpressionNode,
  audioProperties: AudioProperties,
): number {
  // Base case: number literal
  if (typeof node === "number") {
    return node;
  }

  // Variable lookup
  if (node.type === "variable") {
    // Note variables cannot be used in audio context
    if (node.namespace === "note") {
      throw new Error(
        `Cannot use note.${node.name} variable in audio clip context`,
      );
    }

    // Grammar ensures only valid audio properties (currently just 'gain') are parsed
    return audioProperties[node.name as keyof AudioProperties];
  }

  // Arithmetic operators
  if (
    node.type === "add" ||
    node.type === "subtract" ||
    node.type === "multiply" ||
    node.type === "divide"
  ) {
    return evaluateBinaryOp(node, audioProperties);
  }

  // Function calls - node is a FunctionNode at this point (all other types handled above)
  const funcNode = node as {
    type: "function";
    name: string;
    args: ExpressionNode[];
  };

  // Use position=0 for audio context (clip-level transform)
  // Use a default time range of 0-4 beats (one bar in 4/4)
  return evaluateFunction(
    funcNode.name,
    funcNode.args,
    0, // position
    4, // timeSigNumerator
    4, // timeSigDenominator
    { start: 0, end: 4 }, // timeRange
    {}, // noteProperties (empty for audio)
    (expr, pos, num, denom, range, _props) =>
      evaluateAudioExpressionWithContext(
        expr,
        audioProperties,
        pos,
        num,
        denom,
        range,
      ),
  );
}

/**
 * Evaluate binary operation in audio context
 * @param node - Binary operation node
 * @param audioProperties - Audio properties for variable access
 * @returns Evaluated numeric result
 */
function evaluateBinaryOp(
  node: BinaryOpNode,
  audioProperties: AudioProperties,
): number {
  const left = evaluateAudioExpression(node.left, audioProperties);
  const right = evaluateAudioExpression(node.right, audioProperties);

  switch (node.type) {
    case "add":
      return left + right;
    case "subtract":
      return left - right;
    case "multiply":
      return left * right;
    case "divide":
      return right === 0 ? 0 : left / right;
  }
}

/**
 * Evaluate expression with context (for function callbacks)
 * @param node - Expression node to evaluate
 * @param audioProperties - Audio properties for variable access
 * @param _position - Position in beats (unused in audio context)
 * @param _timeSigNumerator - Time signature numerator (unused)
 * @param _timeSigDenominator - Time signature denominator (unused)
 * @param _timeRange - Time range (unused)
 * @param _timeRange.start - Start of time range
 * @param _timeRange.end - End of time range
 * @returns Evaluated numeric result
 */
function evaluateAudioExpressionWithContext(
  node: ExpressionNode,
  audioProperties: AudioProperties,
  _position: number,
  _timeSigNumerator: number,
  _timeSigDenominator: number,
  _timeRange: { start: number; end: number },
): number {
  return evaluateAudioExpression(node, audioProperties);
}

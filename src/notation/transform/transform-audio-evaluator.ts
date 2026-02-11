// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: GPL-3.0-or-later

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

// Constants for pitch shift clamping
const MIN_PITCH_SHIFT = -48;
const MAX_PITCH_SHIFT = 48;

// MIDI-only parameters that should be skipped for audio clips
const MIDI_PARAMETERS = new Set([
  "velocity",
  "timing",
  "duration",
  "probability",
  "deviation",
  "pitch",
]);

export interface AudioProperties {
  gain: number;
  pitchShift: number;
}

export interface AudioTransformResult {
  gain: number | null;
  pitchShift: number | null;
}

/**
 * Apply audio transforms to a clip (gain and/or pitchShift)
 * @param currentGainDb - Current gain in dB
 * @param currentPitchShift - Current pitch shift in semitones
 * @param transformString - Transform expression string
 * @returns Object with new gain and pitchShift values, or null for unchanged
 */
export function applyAudioTransform(
  currentGainDb: number,
  currentPitchShift: number,
  transformString: string | undefined,
): AudioTransformResult {
  if (!transformString) {
    return { gain: null, pitchShift: null };
  }

  let ast: TransformAssignment[];

  try {
    ast = parser.parse(transformString);
  } catch (error) {
    console.warn(`Failed to parse transform string: ${errorMessage(error)}`);

    return { gain: null, pitchShift: null };
  }

  // Check for MIDI parameters and warn
  const hasMidiParams = ast.some((a) => MIDI_PARAMETERS.has(a.parameter));

  if (hasMidiParams) {
    console.warn(
      "MIDI parameters (velocity, timing, duration, probability, deviation, pitch) ignored for audio clips",
    );
  }

  // Filter to audio-only assignments (gain and pitchShift)
  const audioAssignments = ast.filter(
    (a) => a.parameter === "gain" || a.parameter === "pitchShift",
  );

  if (audioAssignments.length === 0) {
    return { gain: null, pitchShift: null };
  }

  // Build audio properties for variable access
  const audioProperties: AudioProperties = {
    gain: currentGainDb,
    pitchShift: currentPitchShift,
  };

  let newGainDb = currentGainDb;
  let newPitchShift = currentPitchShift;
  let gainModified = false;
  let pitchShiftModified = false;

  for (const assignment of audioAssignments) {
    try {
      const value = evaluateAudioExpression(
        assignment.expression,
        audioProperties,
      );

      if (assignment.parameter === "gain") {
        if (assignment.operator === "set") {
          newGainDb = value;
        } else {
          newGainDb += value;
        }

        audioProperties.gain = newGainDb;
        gainModified = true;
      } else if (assignment.parameter === "pitchShift") {
        if (assignment.operator === "set") {
          newPitchShift = value;
        } else {
          newPitchShift += value;
        }

        audioProperties.pitchShift = newPitchShift;
        pitchShiftModified = true;
      }
    } catch (error) {
      console.warn(
        `Failed to evaluate ${assignment.parameter} transform: ${errorMessage(error)}`,
      );
    }
  }

  return {
    gain: gainModified
      ? Math.max(MIN_GAIN_DB, Math.min(MAX_GAIN_DB, newGainDb))
      : null,
    pitchShift: pitchShiftModified
      ? Math.max(MIN_PITCH_SHIFT, Math.min(MAX_PITCH_SHIFT, newPitchShift))
      : null,
  };
}

type BinaryOpNode = {
  type: "add" | "subtract" | "multiply" | "divide" | "modulo";
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
    node.type === "divide" ||
    node.type === "modulo"
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
    case "modulo":
      // Modulo by zero yields 0 (same as division)
      // Use wraparound behavior: ((val % n) + n) % n
      return right === 0 ? 0 : ((left % right) + right) % right;
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

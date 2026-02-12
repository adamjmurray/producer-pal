// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: GPL-3.0-or-later

import { barBeatToBeats } from "#src/notation/barbeat/time/barbeat-time.ts";
import { errorMessage } from "#src/shared/error-utils.ts";
import * as console from "#src/shared/v8-max-console.ts";
import type {
  ExpressionNode,
  TransformAssignment,
  PitchRange,
} from "./parser/transform-parser.ts";
import { evaluateFunction } from "./transform-functions.ts";

export interface TimeRange {
  start: number;
  end: number;
}

export interface TimeSig {
  numerator: number;
  denominator: number;
}

export interface NoteContext {
  position: number;
  pitch?: number;
  bar?: number;
  beat?: number;
  timeSig: TimeSig;
  clipTimeRange?: TimeRange;
}

export type NoteProperties = Record<string, number | undefined>;

export interface ClipContext {
  clipDuration: number; // musical beats
  clipIndex: number; // 0-based in multi-clip operation
  clipCount: number; // total clips in operation
  arrangementStart?: number; // musical beats; undefined for session clips
  barDuration: number; // musical beats per bar (timeSigNumerator)
}

export interface TransformResult {
  operator: "add" | "set";
  value: number;
}

type ProcessAssignmentResult =
  | { skip: true }
  | { skip?: false; value: number; pitchRange: PitchRange | null };

type TimeRangeResult = { skip: true } | { skip?: false; timeRange: TimeRange };

/**
 * Evaluate a pre-parsed transform AST for a specific note context
 * @param ast - Pre-parsed transform AST
 * @param noteContext - Note context for evaluation
 * @param noteProperties - Note properties for variable access
 * @returns Record of transform results keyed by parameter name
 */
export function evaluateTransformAST(
  ast: TransformAssignment[],
  noteContext: NoteContext,
  noteProperties: NoteProperties = {},
): Record<string, TransformResult> {
  const { position, pitch, bar, beat, timeSig, clipTimeRange } = noteContext;
  const { numerator, denominator } = timeSig;

  const result: Record<string, TransformResult> = {};
  let currentPitchRange: PitchRange | null = null; // Track persistent pitch range context

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

    result[assignment.parameter] = {
      operator: assignment.operator,
      value: assignmentResult.value,
    };
  }

  return result;
}

/**
 * Process a single transform assignment
 * @param assignment - Transform assignment to process
 * @param position - Note position in beats
 * @param pitch - Note pitch (optional)
 * @param bar - Note bar number (optional)
 * @param beat - Note beat number (optional)
 * @param numerator - Time signature numerator
 * @param denominator - Time signature denominator
 * @param clipTimeRange - Clip time range (optional)
 * @param noteProperties - Note properties for variable access
 * @param currentPitchRange - Current pitch range context
 * @returns Assignment result or skip indicator
 */
function processAssignment(
  assignment: TransformAssignment,
  position: number,
  pitch: number | undefined,
  bar: number | undefined,
  beat: number | undefined,
  numerator: number,
  denominator: number,
  clipTimeRange: TimeRange | undefined,
  noteProperties: NoteProperties,
  currentPitchRange: PitchRange | null,
): ProcessAssignmentResult {
  try {
    // Update persistent pitch range context if specified
    let pitchRange: PitchRange | null = null;

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
    console.warn(
      `Failed to evaluate transform for parameter "${assignment.parameter}": ${errorMessage(error)}`,
    );

    return { skip: true };
  }
}

/**
 * Calculate active time range for an assignment
 * @param assignment - Transform assignment
 * @param bar - Note bar number (optional)
 * @param beat - Note beat number (optional)
 * @param numerator - Time signature numerator
 * @param denominator - Time signature denominator
 * @param clipTimeRange - Clip time range (optional)
 * @param position - Note position in beats
 * @returns Time range result or skip indicator
 */
function calculateActiveTimeRange(
  assignment: TransformAssignment,
  bar: number | undefined,
  beat: number | undefined,
  numerator: number,
  denominator: number,
  clipTimeRange: TimeRange | undefined,
  position: number,
): TimeRangeResult {
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
    timeRange: clipTimeRange ?? { start: 0, end: position },
  };
}

type BinaryOpNode = {
  type: "add" | "subtract" | "multiply" | "divide" | "modulo";
  left: ExpressionNode;
  right: ExpressionNode;
};

type EvalContext = {
  position: number;
  timeSigNumerator: number;
  timeSigDenominator: number;
  timeRange: TimeRange;
  noteProperties: NoteProperties;
};

/**
 * Evaluate a binary operation node
 * @param node - Binary operation node
 * @param ctx - Evaluation context
 * @returns Result of the operation
 */
function evaluateBinaryOp(node: BinaryOpNode, ctx: EvalContext): number {
  const {
    position,
    timeSigNumerator,
    timeSigDenominator,
    timeRange,
    noteProperties,
  } = ctx;
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

  switch (node.type) {
    case "add":
      return left + right;
    case "subtract":
      return left - right;
    case "multiply":
      return left * right;
    case "divide":
      // Division by zero yields 0 per spec
      return right === 0 ? 0 : left / right;
    case "modulo":
      // Modulo by zero yields 0 (same as division)
      // Use wraparound behavior: ((val % n) + n) % n
      return right === 0 ? 0 : ((left % right) + right) % right;
  }
}

/**
 * Evaluate an expression AST node
 * @param node - Expression node to evaluate
 * @param position - Note position in beats
 * @param timeSigNumerator - Time signature numerator
 * @param timeSigDenominator - Time signature denominator
 * @param timeRange - Active time range
 * @param noteProperties - Note properties for variable access
 * @returns Evaluated numeric result
 */
export function evaluateExpression(
  node: ExpressionNode,
  position: number,
  timeSigNumerator: number,
  timeSigDenominator: number,
  timeRange: TimeRange,
  noteProperties: NoteProperties = {},
): number {
  // Base case: number literal
  if (typeof node === "number") {
    return node;
  }

  // Variable lookup
  if (node.type === "variable") {
    // Audio variables cannot be used in MIDI note context
    if (node.namespace === "audio") {
      throw new Error(
        `Cannot use audio.${node.name} variable in MIDI note context`,
      );
    }

    // Determine lookup key: note.* uses bare name, clip.*/bar.* use prefixed keys
    const lookupKey =
      node.namespace === "note" ? node.name : `${node.namespace}:${node.name}`;

    if (noteProperties[lookupKey] == null) {
      throw new Error(
        `Variable "${node.namespace}.${node.name}" is not available in this context`,
      );
    }

    return noteProperties[lookupKey];
  }

  // Arithmetic operators
  if (
    node.type === "add" ||
    node.type === "subtract" ||
    node.type === "multiply" ||
    node.type === "divide" ||
    node.type === "modulo"
  ) {
    return evaluateBinaryOp(node, {
      position,
      timeSigNumerator,
      timeSigDenominator,
      timeRange,
      noteProperties,
    });
  }

  // Function calls - node.type can only be "function" at this point
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- exhaustiveness check for type narrowing
  if (node.type === "function") {
    return evaluateFunction(
      node.name,
      node.args,
      node.sync,
      position,
      timeSigNumerator,
      timeSigDenominator,
      timeRange,
      noteProperties,
      evaluateExpression,
    );
  }

  throw new Error(
    `Unknown expression node type: ${(node as { type: string }).type}`,
  );
}

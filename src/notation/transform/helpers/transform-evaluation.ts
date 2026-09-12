// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { wholeNoteFractionToMusicalBeats } from "#src/notation/barbeat/barbeat-config.ts";
import { barBeatToMusicalBeats } from "#src/notation/barbeat/time/barbeat-time.ts";
import { errorMessage } from "#src/shared/error-message.ts";
import * as console from "../transform-warning-label.ts";
import {
  type ExpressionNode,
  type NoteOp,
  type TransformAssignment,
  type TransformStatement,
} from "../parser/transform-parser.ts";
import { evaluateFunction } from "../transform-functions.ts";
import { evaluatePredicate } from "./predicate-evaluation.ts";
import {
  noteInTimeRange,
  timeRangeBoundsInMusicalBeats,
} from "./time-range-bounds.ts";
import {
  type EvalContext,
  type NoteContext,
  type NoteProperties,
  type TimeRangeResult,
  type TransformResult,
} from "./transform-context.ts";

type ProcessAssignmentResult = { skip: true } | { skip?: false; value: number };

/**
 * Type guard: distinguish a note-count operation from a parameter assignment.
 * NoteOps carry a `kind: "noteOp"` discriminant; assignments have no `kind`.
 * @param stmt - A parsed transform statement
 * @returns True if the statement is a note-count operation
 */
export function isNoteOp(stmt: TransformStatement): stmt is NoteOp {
  return "kind" in stmt;
}

/**
 * Map an assignment's internal operator token to the source symbol the user
 * wrote, for warning messages. The parser normalizes `-=` into `add` (with a
 * negated expression), so only `set`/`add` reach here; both display forms a user
 * would recognize.
 * @param operator - The internal operator token ("set" or "add")
 * @returns The display symbol ("=" or "+=")
 */
export function operatorDisplay(operator: "set" | "add"): string {
  return operator === "set" ? "=" : "+=";
}

/**
 * Evaluate a pre-parsed transform AST for a specific note context
 * @param ast - Pre-parsed transform AST
 * @param noteContext - Note context for evaluation
 * @param noteProperties - Note properties for variable access
 * @returns Record of transform results keyed by parameter name
 */
export function evaluateTransformAST(
  ast: TransformStatement[],
  noteContext: NoteContext,
  noteProperties: NoteProperties = {},
): Record<string, TransformResult> {
  const result: Record<string, TransformResult> = {};

  for (const assignment of ast) {
    // Note-count ops (ratchet/merge/split/repeat) act on the whole note list,
    // not a single note's scalar value — no meaning in this per-note evaluation.
    if (isNoteOp(assignment)) {
      continue;
    }

    const assignmentResult = processAssignment(
      assignment,
      noteContext,
      noteProperties,
    );

    if (assignmentResult.skip) {
      continue;
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
 * @param noteContext - Note context for evaluation
 * @param noteProperties - Note properties for variable access
 * @returns Assignment result or skip indicator
 */
function processAssignment(
  assignment: TransformAssignment,
  noteContext: NoteContext,
  noteProperties: NoteProperties,
): ProcessAssignmentResult {
  const { position, pitch, timeSig } = noteContext;

  try {
    // Apply pitch filtering. Per-line: a line's pitch selector applies only to
    // that line (no selector = all pitches); there is no carryover from earlier
    // lines, mirroring the time-range selector.
    if (assignment.pitchRange != null && pitch != null) {
      const { startPitch, endPitch } = assignment.pitchRange;

      if (pitch < startPitch || pitch > endPitch) {
        return { skip: true }; // Skip this assignment - note's pitch outside range
      }
    }

    // Calculate the active timeRange for this assignment
    const activeTimeRange = calculateActiveTimeRange(assignment, noteContext);

    if (activeTimeRange.skip) {
      return { skip: true };
    }

    const ctx: EvalContext = {
      position,
      timeSigNumerator: timeSig.numerator,
      timeSigDenominator: timeSig.denominator,
      timeRange: activeTimeRange.timeRange,
      noteProperties,
      evaluateExpression,
    };

    // where() predicate filter, AND-combined with the positional selector: the
    // note must satisfy the predicate too. A throw here (e.g. a missing property)
    // is caught below and warn-and-skipped like any other eval failure.
    if (
      assignment.predicate != null &&
      !evaluatePredicate(assignment.predicate, ctx)
    ) {
      return { skip: true };
    }

    return { value: evaluateExpression(assignment.expression, ctx) };
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
 * @param noteContext - Note context supplying the note's position and meter
 * @returns Time range result or skip indicator
 */
export function calculateActiveTimeRange(
  assignment: TransformAssignment,
  noteContext: NoteContext,
): TimeRangeResult {
  const { position, bar, beat, clipTimeRange } = noteContext;
  const numerator = noteContext.timeSig.numerator;

  if (assignment.timeRange) {
    const { start: startBeats, end: endBeats } = timeRangeBoundsInMusicalBeats(
      assignment.timeRange,
      numerator,
    );
    // Note's absolute musical beats. Prefer the bar|beat fields when present
    // (production always supplies them via buildNoteContext); otherwise fall back
    // to `position` — the same value — so a caller that provides only `position`
    // (e.g. the exported evaluateTransform()) still gets selectors enforced
    // instead of silently matching the whole clip.
    const noteBeats =
      bar != null && beat != null
        ? barBeatToMusicalBeats(`${bar}|${beat}`, numerator)
        : position;

    if (!noteInTimeRange(noteBeats, assignment.timeRange, numerator)) {
      return { skip: true }; // Skip this assignment - note outside time range
    }

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

/**
 * Evaluate a binary operation node
 * @param node - Binary operation node
 * @param ctx - Evaluation context
 * @returns Result of the operation
 */
function evaluateBinaryOp(node: BinaryOpNode, ctx: EvalContext): number {
  return applyBinaryOp(
    node.type,
    evaluateExpression(node.left, ctx),
    evaluateExpression(node.right, ctx),
  );
}

/**
 * Apply a binary arithmetic operator to two already-evaluated operands. Shared
 * by the note and audio evaluators, whose operand evaluation differs but whose
 * arithmetic (including the divide/modulo-by-zero rules) must not.
 * @param type - The operator
 * @param left - Left operand
 * @param right - Right operand
 * @returns Result of the operation
 */
export function applyBinaryOp(
  type: BinaryOpNode["type"],
  left: number,
  right: number,
): number {
  switch (type) {
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

    // Unreachable: every operator is handled above, and the `never` keeps it
    // that way if a new one is added.
    default: {
      const exhaustive: never = type;

      return exhaustive;
    }
  }
}

/**
 * Evaluate an expression AST node
 * @param node - Expression node to evaluate
 * @param ctx - Evaluation context
 * @returns Evaluated numeric result
 */
export function evaluateExpression(
  node: ExpressionNode,
  ctx: EvalContext,
): number {
  const { noteProperties } = ctx;

  // Base case: number literal
  if (typeof node === "number") {
    return node;
  }

  // Pitch literal (`C4`, `b2`) — evaluates to its MIDI number. The node stays
  // tagged through the AST so applyAssignmentToNotes can warn-and-skip a bare
  // pitch literal assigned to a non-pitch parameter; everywhere else (function
  // args, `pitch = C4`) it is just its number.
  if (node.type === "pitchLiteral") {
    return node.value;
  }

  // Absolute duration (n/4, n/8, etc.) — resolves to musical beats based on meter
  if (node.type === "nDuration") {
    return wholeNoteFractionToMusicalBeats(
      node.wholeNoteFraction,
      ctx.timeSigDenominator,
    );
  }

  // Bar duration (<count>bar) — N bars in musical beats (beats-per-bar = numerator),
  // identical to N * clip.barDuration
  if (node.type === "barDuration") {
    return node.bars * ctx.timeSigNumerator;
  }

  // Variable lookup
  if (node.type === "variable") {
    // Audio variables cannot be used in MIDI note context
    if (node.namespace === "audio") {
      throw new Error(
        `Cannot use audio.${node.name} variable in MIDI note context`,
      );
    }

    // Determine lookup key: note.* uses bare name, clip.* uses prefixed keys
    const lookupKey =
      node.namespace === "note" ? node.name : `${node.namespace}:${node.name}`;

    if (noteProperties[lookupKey] == null) {
      // clip.position on a session clip: no arrangement origin. Fall back to 0
      // (neutral) + warn instead of failing the transform — mirrors the audio
      // evaluator so the condition is recoverable on both note and audio paths.
      if (node.namespace === "clip" && node.name === "position") {
        console.warn(
          `clip.position is not available for session clips; using 0`,
        );

        return 0;
      }

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
    return evaluateBinaryOp(node, ctx);
  }

  // Function calls - node.type can only be "function" at this point
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- exhaustiveness check for type narrowing
  if (node.type === "function") {
    return evaluateFunction(node.name, node.args, node.sync, node.raw, ctx);
  }

  throw new Error(
    `Unknown expression node type: ${(node as { type: string }).type}`,
  );
}

/**
 * Context for evaluating a constant expression, such as a note-op argument with
 * no note in scope. Only the meter can affect the result.
 * @param timeSigNumerator - Time signature numerator
 * @param timeSigDenominator - Time signature denominator
 * @returns A context with no note position, time range, or properties
 */
export function constantEvalContext(
  timeSigNumerator: number,
  timeSigDenominator: number,
): EvalContext {
  return {
    position: 0,
    timeSigNumerator,
    timeSigDenominator,
    timeRange: { start: 0, end: 0 },
    noteProperties: {},
    evaluateExpression,
  };
}

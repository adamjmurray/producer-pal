// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Type declarations for peggy-generated transform parser.
 * The actual parser is generated from transform-grammar.peggy.
 */

export {
  ParseOptions,
  Location,
  SyntaxError,
  StartRules,
} from "../../peggy-parser-types.ts";

import type { ParseOptions } from "../../peggy-parser-types.ts";

/** Variable reference node */
export interface VariableNode {
  type: "variable";
  namespace: "note" | "audio" | "clip" | "bar" | "next";
  name: string;
}

/** Binary operation node */
export interface BinaryOpNode {
  type: "add" | "subtract" | "multiply" | "divide" | "modulo";
  left: ExpressionNode;
  right: ExpressionNode;
}

/** Function call node */
export interface FunctionNode {
  type: "function";
  name: string;
  args: ExpressionNode[];
  sync: boolean;
  raw: boolean;
}

/** Absolute duration value (e.g., n/4 = quarter note). Resolved to musical beats at evaluation time. */
export interface NDurationNode {
  type: "nDuration";
  wholeNoteFraction: number;
}

/** Meter-aware bar duration (e.g., 1bar). Resolves to bars * beats-per-bar musical beats. */
export interface BarDurationNode {
  type: "barDuration";
  bars: number;
}

/** Pitch literal (e.g., C4, b2). Evaluates to its MIDI number, but stays tagged
 * so a bare pitch literal assigned to a non-pitch parameter can be warned-and-skipped. */
export interface PitchLiteralNode {
  type: "pitchLiteral";
  value: number;
  name: string;
}

/** Expression AST node */
export type ExpressionNode =
  | number
  | VariableNode
  | BinaryOpNode
  | FunctionNode
  | NDurationNode
  | BarDurationNode
  | PitchLiteralNode;

/** A clip-relative bar|beat cut position for `split`, resolved by the parser to
 * absolute musical beats from the clip's `1|1` origin. */
export interface BarBeatPointNode {
  type: "barBeatPoint";
  musicalBeats: number;
}

/** Pitch range filter */
export interface PitchRange {
  startPitch: number;
  endPitch: number;
}

/** Time range filter */
export interface TimeRange {
  startBar: number;
  startBeat: number;
  endBar: number;
  endBeat: number;
  /** When true the end bound is exclusive (half-open). Set by `N|*`/`A|*-B|*`
   * whole-bar selectors and the `-<` exclusive-end marker; absent/false keeps
   * the legacy inclusive-both-ends behavior. */
  endExclusive?: boolean;
}

/** Transform assignment produced by the parser */
export interface TransformAssignment {
  parameter: string;
  operator: "add" | "set";
  expression: ExpressionNode;
  pitchRange?: PitchRange;
  timeRange?: TimeRange;
}

/**
 * Note-count operation produced by the parser (`ratchet(...)`, `split(...)`,
 * `merge()`). Unlike an assignment, this changes how many notes exist rather
 * than writing a value to a parameter. The `kind` discriminant distinguishes it
 * from a TransformAssignment (which has no `kind` field). The optional selector
 * (pitchRange/timeRange) scopes which notes the op touches. `ratchet`/`merge`
 * carry expression args; `split` carries `BarBeatPointNode` cut positions.
 */
export interface NoteOp {
  kind: "noteOp";
  name: "ratchet" | "merge" | "split";
  args: (ExpressionNode | BarBeatPointNode)[];
  pitchRange?: PitchRange;
  timeRange?: TimeRange;
}

/** A single transform line: either a parameter assignment or a note-count op. */
export type TransformStatement = TransformAssignment | NoteOp;

/** Parse a transform expression string into an AST */
export function parse(
  input: string,
  options?: ParseOptions,
): TransformStatement[];

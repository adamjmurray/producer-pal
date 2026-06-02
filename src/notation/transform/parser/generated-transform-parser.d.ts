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

/** Expression AST node */
export type ExpressionNode =
  | number
  | VariableNode
  | BinaryOpNode
  | FunctionNode
  | NDurationNode
  | BarDurationNode;

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

/** Parse a transform expression string into an AST */
export function parse(
  input: string,
  options?: ParseOptions,
): TransformAssignment[];

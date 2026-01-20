/**
 * Type declarations for peggy-generated modulation parser.
 * The actual parser is generated from modulation-grammar.peggy.
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
  name: string;
}

/** Binary operation node */
export interface BinaryOpNode {
  type: "add" | "subtract" | "multiply" | "divide";
  left: ExpressionNode;
  right: ExpressionNode;
}

/** Function call node */
export interface FunctionNode {
  type: "function";
  name: string;
  args: ExpressionNode[];
}

/** Expression AST node */
export type ExpressionNode =
  | number
  | VariableNode
  | BinaryOpNode
  | FunctionNode;

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
}

/** Modulation assignment produced by the parser */
export interface ModulationAssignment {
  parameter: string;
  operator: "add" | "set";
  expression: ExpressionNode;
  pitchRange?: PitchRange;
  timeRange?: TimeRange;
}

/** Parse a modulation expression string into an AST */
export function parse(
  input: string,
  options?: ParseOptions,
): ModulationAssignment[];

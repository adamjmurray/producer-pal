/**
 * Type declarations for peggy-generated barbeat parser.
 * The actual parser is generated from barbeat-grammar.peggy.
 */

export {
  ParseOptions,
  Location,
  SyntaxError,
  StartRules,
} from "../../peggy-parser-types.ts";

import type { ParseOptions } from "../../peggy-parser-types.ts";

/** Repeat pattern for beats */
export interface RepeatPattern {
  start: number;
  end: number;
  step: number;
}

/** Bar copy destination */
export interface BarCopyDestination {
  bar?: number;
  range?: [number, number];
}

/** Bar copy source */
export type BarCopySource =
  | { bar?: number; range?: [number, number] }
  | "previous";

/** AST element produced by the parser */
export interface ASTElement {
  velocity?: number;
  velocityMin?: number;
  velocityMax?: number;
  duration?: number | string;
  probability?: number;
  pitch?: number;
  bar?: number | null;
  beat?: number | RepeatPattern;
  clearBuffer?: boolean;
  destination?: BarCopyDestination;
  source?: BarCopySource;
}

/** Parse a barbeat expression string into an AST */
export function parse(input: string, options?: ParseOptions): ASTElement[];

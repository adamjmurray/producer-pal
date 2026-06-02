// Producer Pal
// Copyright (C) 2026 Adam Murray
// SPDX-License-Identifier: GPL-3.0-or-later

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
  /** Step as a fraction of a whole note (null when `@step` is omitted) */
  step: number;
  /** Meter-aware bar component of the step (present only for `@Nbar` forms) */
  stepBars?: number;
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
  duration?: number;
  /** Meter-aware bar component of an inline `Nbar` / `Nbar+nA/B` duration */
  bars?: number;
  probability?: number;
  pitch?: number;
  bar?: number;
  beat?: number | RepeatPattern;
  clearBuffer?: boolean;
  destination?: BarCopyDestination;
  source?: BarCopySource;
}

/** Parse a barbeat expression string into an AST */
export function parse(input: string, options?: ParseOptions): ASTElement[];

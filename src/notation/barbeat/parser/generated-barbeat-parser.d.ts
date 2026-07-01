// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
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

/** A single pitch within a chord or stream */
export interface StreamPitch {
  pitch: number;
}

/** A velocity stream value: a single velocity or an auto-ordered range */
export type StreamVelocity =
  | { velocity: number }
  | { velocityMin: number; velocityMax: number };

/**
 * A duration stream value: a whole-note fraction (`duration`) plus an optional
 * meter-aware bar component (`bars`, for `Nbar` / `Nbar+nA/B` forms).
 */
export interface StreamDuration {
  duration: number;
  bars?: number;
}

/** A probability stream value */
export interface StreamProbability {
  probability: number;
}

/**
 * Pattern bracket (pitch, v/n/p): a stream of one parameter's
 * values cycled across emitted note-events. The `param` tag discriminates the
 * `values` element shape — pitch values are chords (a length-1 array for a bare
 * pitch); v/n/p values carry the bare per-kind object.
 */
export type PatternStream =
  | { param: "pitch"; values: StreamPitch[][] }
  | { param: "velocity"; values: StreamVelocity[] }
  | { param: "duration"; values: StreamDuration[] }
  | { param: "probability"; values: StreamProbability[] };

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
  /** Pattern bracket: a cycling stream of values for one parameter */
  stream?: PatternStream;
}

/** Parse a barbeat expression string into an AST */
export function parse(input: string, options?: ParseOptions): ASTElement[];

// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

// The context types a transform is evaluated against, shared by the note and
// audio evaluators, the transform functions, and the clip tools.

import { type ExpressionNode } from "../parser/transform-parser.ts";

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

/** Internal context for legato() tolerance-aware computation */
export interface LegatoContext {
  starts: number[];
  cursor: number;
  clipEnd?: number;
}

export type NoteProperties = Record<string, number | undefined> & {
  _legatoContext?: LegatoContext;
};

/** Evaluates an arithmetic expression node to a number. Carried on the context
 * rather than imported so the function helpers only take a type dependency on
 * the evaluators, avoiding a value import cycle. The note and audio paths each
 * inject their own. */
export type EvaluateExpressionFn = (
  node: ExpressionNode,
  ctx: EvalContext,
) => number;

/** Everything an expression, function call, or where() predicate is evaluated
 * against. Passed as one object so the six values can't be threaded out of
 * order through the evaluator's call chain. */
export interface EvalContext {
  position: number;
  timeSigNumerator: number;
  timeSigDenominator: number;
  timeRange: TimeRange;
  noteProperties: NoteProperties;
  evaluateExpression: EvaluateExpressionFn;
}

export interface ClipContext {
  clipDuration: number; // musical beats
  clipIndex: number; // 0-based in multi-clip operation
  clipCount: number; // total clips in operation
  arrangementStart?: number; // musical beats; undefined for session clips
  barDuration: number; // musical beats per bar (timeSigNumerator)
  timeSigDenominator?: number; // meter denominator; resolves n<frac> waveform periods in the audio path (defaults to 4)
  scalePitchClassMask?: number; // bitmask of in-scale pitch classes (bit N = pitch class N)
}

export interface TransformResult {
  operator: "add" | "set";
  value: number;
}

export type TimeRangeResult =
  | { skip: true }
  | { skip?: false; timeRange: TimeRange };

// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { expect } from "vitest";
import {
  type NoteOp,
  parse,
  type ParseOptions,
  type TransformAssignment,
  type TransformStatement,
} from "#src/notation/transform/parser/transform-parser.ts";

/**
 * Parse a transform string and narrow the result to assignments.
 *
 * The parser returns `TransformStatement[]` (assignments OR note-count ops).
 * Assignment-focused parser tests predate note ops and only inspect assignment
 * fields, so this helper casts to `TransformAssignment[]` to keep those tests
 * concise. Note-op parsing/behavior has its own dedicated tests.
 * @param input - Transform string
 * @param options - Optional parser options
 * @returns Parsed statements typed as assignments
 */
export function parseAssignments(
  input: string,
  options?: ParseOptions,
): TransformAssignment[] {
  return parse(input, options) as TransformAssignment[];
}

/**
 * Build the full assignment shape the parser emits, so tests can assert with
 * `toStrictEqual` without repeating the unset-selector defaults on every case.
 * @param overrides - Fields this case cares about
 * @returns Assignment with `operator`/`pitchRange`/`timeRange` defaulted
 */
export function assignment(
  overrides: Partial<TransformAssignment> &
    Pick<TransformAssignment, "parameter" | "expression">,
): TransformAssignment {
  return { operator: "set", pitchRange: null, timeRange: null, ...overrides };
}

/**
 * Build the full note-op shape the parser emits, so tests can assert with
 * `toStrictEqual` without repeating the unset-selector defaults on every case.
 * @param overrides - Fields this case cares about
 * @returns Note op with `pitchRange`/`timeRange` defaulted
 */
export function noteOp(
  overrides: Partial<NoteOp> & Pick<NoteOp, "name" | "args">,
): NoteOp {
  return { kind: "noteOp", pitchRange: null, timeRange: null, ...overrides };
}

/**
 * Assert the first statement's time-range bounds. Beats compare with float
 * tolerance so a note-value offset (n/12 = 1/3 beat) can be written as a
 * decimal in the test.
 *
 * @param statements - The parsed statements
 * @param bounds - Expected [startBar, startBeat, endBar, endBeat]
 */
export function expectTimeRangeBounds(
  statements: TransformStatement[],
  bounds: [
    startBar: number,
    startBeat: number,
    endBar: number,
    endBeat: number,
  ],
): void {
  const range = statements[0]?.timeRange;

  expect(range?.startBar).toBe(bounds[0]);
  expect(range?.startBeat).toBeCloseTo(bounds[1]);
  expect(range?.endBar).toBe(bounds[2]);
  expect(range?.endBeat).toBeCloseTo(bounds[3]);
}

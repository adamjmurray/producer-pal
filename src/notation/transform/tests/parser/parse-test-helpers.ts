// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import {
  parse,
  type ParseOptions,
  type TransformAssignment,
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

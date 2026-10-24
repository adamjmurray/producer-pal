// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/** What an entry says when a write overrode a parameter's arrangement lane. */
export const OVERRIDDEN =
  "arrangement automation overridden — Live ignores it until Re-Enable Automation";

/**
 * Writes that override nothing, as `[case, automation_state, whether the write
 * changes the value]` for `automatedParam()`.
 */
export const NOT_OVERRIDING_CASES: Array<[string, number, boolean]> = [
  ["already overridden", 2, true],
  ["no lane, or unknown while playing from Session", 0, true],
  ["a lane whose value the write left as it was", 1, false],
];

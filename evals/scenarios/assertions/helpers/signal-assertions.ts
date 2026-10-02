// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

import { type EvalAssertion } from "../../types.ts";

/**
 * Whether an assertion is a non-gating signal: `response_contains` grades the
 * words a model chose, not what it did, so an unlisted synonym must never read
 * as a regression. Signals still run and report; they just don't gate the run.
 * @param assertion - The assertion to classify
 * @returns True when the assertion reports but doesn't gate
 */
export function isSignalAssertion(assertion: EvalAssertion): boolean {
  return assertion.type === "response_contains";
}

// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

import { type EvalAssertion } from "../../types.ts";

/**
 * Whether an assertion is a non-gating signal: `response_contains` grades the
 * words a model chose, not what it did, so an unlisted synonym must never read
 * as a regression. A custom assertion marked `signal` is the same for a route
 * the docs teach alongside others. Signals still run and report; they just
 * don't gate the run.
 * @param assertion - The assertion to classify
 * @returns True when the assertion reports but doesn't gate
 */
export function isSignalAssertion(assertion: EvalAssertion): boolean {
  return (
    assertion.type === "response_contains" ||
    (assertion.type === "custom" && assertion.signal === true)
  );
}

/**
 * Turn a custom assertion into a non-gating signal.
 * @param assertion - A custom assertion
 * @returns The same assertion, reported but never gating
 * @throws When the assertion isn't a custom one, which has no `signal` flag
 */
export function asSignal(assertion: EvalAssertion): EvalAssertion {
  if (assertion.type !== "custom") {
    throw new Error(
      `only a custom assertion can be a signal: ${assertion.type}`,
    );
  }

  return { ...assertion, signal: true };
}

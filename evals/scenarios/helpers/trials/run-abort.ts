// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Why a run stopped early: every trial of the last few scenarios errored
 * before the model took a turn. That is either Live failing to come back after
 * a Set swap, or the model provider refusing requests — and the fix is
 * different, so the message says which.
 */

import { type JsonEvalResult } from "../json-results/types.ts";

/** Provider-side refusals: capacity, rate limits, overload. Not Live. */
const PROVIDER_REFUSAL =
  /at capacity|rate.?limit|overloaded|too many requests|quota|\b(?:429|503|529)\b/i;

/**
 * Build the error that stops a run after `count` scenarios in a row never
 * started.
 *
 * @param count - How many consecutive scenarios errored on every trial
 * @param runs - The trials of the last such scenario
 * @returns The message to throw
 */
export function describeRunAbort(
  count: number,
  runs: JsonEvalResult[],
): string {
  const errors = [...new Set(runs.map((run) => run.error ?? ""))].filter(
    (error) => error !== "",
  );
  const providerRefused =
    errors.length > 0 && errors.every((error) => PROVIDER_REFUSAL.test(error));
  const cause = providerRefused
    ? "the model provider is refusing requests, so this is not Live"
    : "Live is not recovering";
  const sample = errors.length === 0 ? "" : `\nLast error: ${errors[0]}`;

  return (
    `${count} scenarios in a row never started — ${cause}. Stopping so the ` +
    `rest of the run isn't scored blind. Results so far are saved.${sample}`
  );
}

/**
 * The runs of a scenario when none of them reached the model, else nothing.
 *
 * @param modelResults - The scenario's results, by model and label
 * @returns Every run when all errored; an empty list otherwise
 */
export function neverStartedRuns(
  modelResults: Map<string, Map<string, JsonEvalResult[]>>,
): JsonEvalResult[] {
  const runs = [...modelResults.values()].flatMap((byLabel) =>
    [...byLabel.values()].flat(),
  );

  return runs.length > 0 && runs.every((run) => run.result === "error")
    ? runs
    : [];
}

// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/**
 * Stopping models that keep erroring: after a few scenarios in a row where every
 * trial of a model errored, that model is dropped from the rest of the run. If
 * that leaves no model, the run stops. The cause is either Live failing to come
 * back after a Set swap, or the model provider refusing requests — and the fix
 * is different, so the message says which.
 */

import { isProviderRefusal } from "./provider-refusal.ts";
import { type JsonEvalResult } from "../json-results/types.ts";

/** Drop a model after this many scenarios in a row where all its trials errored. */
export const MAX_CONSECUTIVE_SCENARIO_ERRORS = 3;

/**
 * Build the message for a model (or the whole run) stopping after `count`
 * scenarios in a row errored.
 *
 * @param count - How many consecutive scenarios errored on every trial
 * @param runs - The trials of the last such scenario
 * @param modelKey - The model being dropped; omit when the whole run stops
 * @returns The message to show or throw
 */
export function describeRunAbort(
  count: number,
  runs: JsonEvalResult[],
  modelKey?: string,
): string {
  const errors = [...new Set(runs.map((run) => run.error ?? ""))].filter(
    (error) => error !== "",
  );
  const providerRefused =
    errors.length > 0 && errors.every((error) => isProviderRefusal(error));
  const cause = providerRefused
    ? "the model provider is refusing requests, so this is not Live"
    : "Live is not recovering";
  const last = runs.findLast((run) => run.error)?.error;
  const sample = last == null ? "" : `\nLast error: ${last}`;
  const action =
    modelKey == null
      ? "Stopping so the rest of the run isn't scored blind. Results so far are saved."
      : `Dropping ${modelKey} from the rest of the run.`;
  const subject = modelKey == null ? "" : `${modelKey}: `;

  return `${subject}${count} scenarios in a row errored — ${cause}. ${action}${sample}`;
}

/**
 * Count, per model, the scenarios in a row where every trial errored, and
 * return the models that just reached the limit.
 *
 * @param streaks - Each model's current count, updated in place
 * @param modelResults - The scenario's results, by model and label
 * @returns Each model to drop, with the trials of its last errored scenario
 */
export function stalledModels(
  streaks: Map<string, number>,
  modelResults: Map<string, Map<string, JsonEvalResult[]>>,
): Map<string, JsonEvalResult[]> {
  const stalled = new Map<string, JsonEvalResult[]>();

  for (const [modelKey, byLabel] of modelResults) {
    const runs = [...byLabel.values()].flat();
    const allErrored =
      runs.length > 0 && runs.every((run) => run.result === "error");
    const streak = allErrored ? (streaks.get(modelKey) ?? 0) + 1 : 0;

    streaks.set(modelKey, streak);

    if (streak >= MAX_CONSECUTIVE_SCENARIO_ERRORS) {
      stalled.set(modelKey, runs);
    }
  }

  return stalled;
}

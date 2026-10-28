// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/**
 * Every failure of a run as a markdown table, for `dev/quality/eval-findings/`.
 * Several result directories stitch into one run: for each scenario and model,
 * the newest directory with a graded trial wins, so a re-run replaces the
 * trials it repeats.
 */

import { type JsonEvalResult } from "../json-results/types.ts";
import { isProviderRefusal } from "../trials/provider-refusal.ts";

type Cells = Map<string, Map<string, JsonEvalResult[]>>;

/**
 * Build the failure table for one or more runs.
 *
 * @param runs - Each run's results, oldest first
 * @returns Markdown: one row per scenario any model failed, then the totals
 */
export function buildFailureTable(runs: JsonEvalResult[][]): string {
  const cells = stitchRuns(runs);
  const models = [
    ...new Set([...cells.values()].flatMap((m) => [...m.keys()])),
  ];
  const kinds = new Map(runs.flat().map((r) => [r.scenarioId, r.kind]));
  const failing = [...cells.keys()]
    .filter((id) =>
      [...(cells.get(id)?.values() ?? [])].some((trials) =>
        trials.some((t) => t.result === "fail"),
      ),
    )
    .toSorted();

  const header = ["scenario", "kind", ...models];
  const lines = [row(header), row(header.map(() => "---"))];

  for (const id of failing) {
    const byModel = cells.get(id);

    lines.push(
      row([
        `\`${id}\``,
        kinds.get(id) ?? "",
        ...models.map((model) => tally(byModel?.get(model))),
      ]),
    );
  }

  lines.push(
    row(["**total**", "", ...models.map((model) => total(cells, model))]),
  );

  return lines.join("\n");
}

/**
 * Whether a trial graded the model. Errors, skips, and runs the provider
 * refused (scored `fail` before refusals were their own outcome) don't.
 *
 * @param trial - One stored trial
 * @returns True for a real pass or fail
 */
function isGraded(trial: JsonEvalResult): boolean {
  if (trial.result === "pass") {
    return true;
  }

  return (
    trial.result === "fail" &&
    !(trial.error != null && isProviderRefusal(trial.error))
  );
}

/**
 * Merge runs into scenario → model → graded trials, newest run winning.
 *
 * @param runs - Each run's results, oldest first
 * @returns The stitched cells
 */
function stitchRuns(runs: JsonEvalResult[][]): Cells {
  const cells: Cells = new Map();

  for (const run of runs) {
    const fresh: Cells = new Map();

    for (const trial of run.filter((t) => isGraded(t))) {
      const byModel = fresh.get(trial.scenarioId) ?? new Map();
      const trials = byModel.get(trial.model) ?? [];

      trials.push(trial);
      byModel.set(trial.model, trials);
      fresh.set(trial.scenarioId, byModel);
    }

    for (const [id, byModel] of fresh) {
      const merged = cells.get(id) ?? new Map();

      for (const [model, trials] of byModel) {
        merged.set(model, trials);
      }

      cells.set(id, merged);
    }
  }

  return cells;
}

/**
 * @param trials - A cell's graded trials
 * @returns `passed/total`, or `—` when the model never graded the scenario
 */
function tally(trials: JsonEvalResult[] | undefined): string {
  if (trials == null) {
    return "—";
  }

  return `${trials.filter((t) => t.result === "pass").length}/${trials.length}`;
}

/**
 * @param cells - The stitched cells
 * @param model - Model key
 * @returns Passed over graded trials, with how many scenarios that covers
 */
function total(cells: Cells, model: string): string {
  const trials = [...cells.values()].flatMap((m) => m.get(model) ?? []);
  const scenarios = [...cells.values()].filter((m) => m.has(model)).length;

  return `${tally(trials)} (${scenarios} scenarios)`;
}

/**
 * @param cells - Cell texts
 * @returns One markdown table row
 */
function row(cells: string[]): string {
  return `| ${cells.join(" | ")} |`;
}

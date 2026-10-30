// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/**
 * Print the pass table for a results folder, for a run that was cancelled
 * before its own summary printed, plus the Jev totals when the run used Jev.
 */

import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { type ModelSpec } from "#evals/shared/parse-model-arg.ts";
import { type JsonEvalResult } from "../json-results/types.ts";
import { jevSummaryLines } from "./jev-judge-report.ts";
import { printResultsTable, type ResultsByScenario } from "./report-table.ts";

/**
 * Print passed/graded trials per scenario and model, with totals, for every
 * result stored in a folder.
 *
 * @param dir - A run's results folder
 * @returns False when the folder has no results
 */
export async function printStoredRunSummary(dir: string): Promise<boolean> {
  const results = await loadResultsInDir(dir);

  if (results.length === 0) {
    return false;
  }

  const { resultsByScenario, modelSpecs, label } = groupResults(results);

  printResultsTable(resultsByScenario, modelSpecs, label, { passes: true });

  const jevLines = jevSummaryLines(results);

  if (jevLines.length > 0) {
    console.log("\n" + jevLines.map((l) => "  " + l).join("\n"));
  }

  return true;
}

/**
 * Read every result file in a folder.
 *
 * @param dir - Folder to scan
 * @returns The parsed results, or none when the folder is missing
 */
async function loadResultsInDir(dir: string): Promise<JsonEvalResult[]> {
  let files: string[];

  try {
    files = await readdir(dir);
  } catch {
    return [];
  }

  return await Promise.all(
    files
      .filter((file) => file.endsWith(".json"))
      .toSorted()
      .map(async (file) => {
        const text = await readFile(join(dir, file), "utf-8");

        return JSON.parse(text) as JsonEvalResult;
      }),
  );
}

/**
 * Group stored results into the table's scenario → model → label map, trials in
 * order. A run has one run-environment label, so the first result's is used.
 *
 * @param results - Every stored result of a run
 * @returns The map, the models and the label (scenarios and models sorted)
 */
function groupResults(results: JsonEvalResult[]): {
  resultsByScenario: ResultsByScenario;
  modelSpecs: ModelSpec[];
  label: string;
} {
  const label = (results[0] as JsonEvalResult).configProfileId;
  const resultsByScenario: ResultsByScenario = new Map();
  const modelSpecs = new Map<string, ModelSpec>();

  for (const result of results.toSorted(
    (a, b) => (a.trial ?? 0) - (b.trial ?? 0),
  )) {
    const byModel = resultsByScenario.get(result.scenarioId) ?? new Map();
    const cell = byModel.get(result.model) ?? new Map([[label, []]]);

    cell.get(label).push(result);
    byModel.set(result.model, cell);
    resultsByScenario.set(result.scenarioId, byModel);

    if (!modelSpecs.has(result.model)) {
      const slash = result.model.indexOf("/");

      modelSpecs.set(result.model, {
        provider: slash === -1 ? result.model : result.model.slice(0, slash),
        model: result.model.slice(slash + 1),
      } as ModelSpec);
    }
  }

  return {
    resultsByScenario: new Map([...resultsByScenario].toSorted(sortById)),
    modelSpecs: [...modelSpecs].toSorted(sortById).map(([, spec]) => spec),
    label,
  };
}

/**
 * Order map entries by key.
 *
 * @param a - One entry
 * @param b - Another entry
 * @returns Sort order
 */
function sortById(a: [string, unknown], b: [string, unknown]): number {
  return a[0].localeCompare(b[0]);
}

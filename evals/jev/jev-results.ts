// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/**
 * Loads saved eval results (by default only those with a stored judge verdict),
 * paired with the criteria their scenario gives the judge.
 */

import { readdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { lastCriteriaChange } from "./jev-criteria-dates.ts";
import { allScenarios } from "#evals/scenarios/load-scenarios/all-scenarios.ts";
import { restoreInjectedBlocks } from "#evals/scenarios/helpers/json-results/injected-blocks.ts";
import { isResultFile } from "#evals/scenarios/helpers/json-results/result-file.ts";
import {
  RESULTS_DIR,
  type JsonEvalResult,
} from "#evals/scenarios/helpers/json-results/types.ts";
import { type EvalScenario } from "#evals/scenarios/types.ts";

export interface JudgedResult {
  /** Path relative to the results directory */
  file: string;
  result: JsonEvalResult;
  /** The scenario's first llm_judge prompt */
  criteria: string;
}

export interface SkipCounts {
  /** Result was skipped or errored, so nothing was judged */
  notScored: number;
  /** The scenario no longer exists */
  noScenario: number;
  /** The scenario no longer has an llm_judge */
  noLlmJudge: number;
  /** The file could not be read as a result */
  unreadable: number;
  /** Recorded before the scenario's judge criteria last changed */
  staleCriteria: number;
  /** Jev gave the stored verdict (a `--jev` run), so there is no LLM verdict */
  jevDecided: number;
}

export interface LoadedResults {
  items: JudgedResult[];
  skipped: SkipCounts;
}

export interface LoadOptions {
  /** Run ids to read; default is every run directory */
  runIds?: string[];
  /** Only these scenario ids; default is all */
  scenarioIds?: string[];
  resultsDir?: string;
  scenarios?: EvalScenario[];
  /** Keep results recorded before the criteria last changed */
  includeStale?: boolean;
  /** Also load results with no stored judge verdict (default: skip them) */
  includeUnjudged?: boolean;
  /** Leave out results whose stored verdict came from Jev, for comparing Jev
   *  with the stored LLM verdict */
  llmVerdictOnly?: boolean;
  /** When a prompt last changed (ISO date); default reads git history */
  criteriaDate?: (prompt: string) => string | undefined;
}

/**
 * Read saved results that have a stored judge verdict (or all, with
 * `includeUnjudged`).
 *
 * @param options - Which runs and scenarios to read
 * @returns Judged results with their criteria, and counts of what was skipped
 */
export async function loadJudgedResults(
  options: LoadOptions = {},
): Promise<LoadedResults> {
  const dir = options.resultsDir ?? RESULTS_DIR;
  const scenarios = options.scenarios ?? allScenarios;
  const byId = new Map(scenarios.map((s) => [s.id, s]));
  const runIds = options.runIds ?? (await listRunDirs(dir));
  const items: JudgedResult[] = [];
  const skipped: SkipCounts = {
    notScored: 0,
    noScenario: 0,
    noLlmJudge: 0,
    unreadable: 0,
    staleCriteria: 0,
    jevDecided: 0,
  };
  const dateOf = options.criteriaDate ?? lastCriteriaChange;
  const changedAt = new Map<string, number | undefined>();

  for (const runId of runIds) {
    for (const name of await listJsonFiles(join(dir, runId))) {
      const file = join(runId, name);
      const result = await readResult(join(dir, file));
      const outcome = classify(
        result,
        byId,
        options.scenarioIds,
        options.includeUnjudged,
        options.llmVerdictOnly,
      );

      if (typeof outcome === "string") {
        if (outcome !== "ignored") {
          skipped[outcome]++;
        }
      } else if (
        options.includeStale !== true &&
        isStale(outcome, changedAt, dateOf)
      ) {
        skipped.staleCriteria++;
      } else {
        items.push({
          file,
          result: outcome.result,
          criteria: outcome.criteria,
        });
      }
    }
  }

  return { items, skipped };
}

/**
 * Was the result recorded before its scenario's criteria last changed? The date
 * is looked up once per scenario.
 *
 * @param outcome - A comparable result and its current criteria
 * @param cache - Criteria change times by scenario id (ms, undefined if unknown)
 * @param dateOf - Finds when a prompt last changed
 * @returns True when the result was judged against older criteria
 */
function isStale(
  outcome: { result: JsonEvalResult; criteria: string },
  cache: Map<string, number | undefined>,
  dateOf: (prompt: string) => string | undefined,
): boolean {
  const id = outcome.result.scenarioId;

  if (!cache.has(id)) {
    const date = dateOf(outcome.criteria);

    cache.set(id, date == null ? undefined : new Date(date).getTime());
  }

  const changed = cache.get(id);

  return (
    changed != null && new Date(outcome.result.timestamp).getTime() < changed
  );
}

/**
 * Decide whether a result can be compared.
 *
 * @param result - The parsed result, or undefined when unreadable
 * @param scenarios - Known scenarios by id
 * @param scenarioIds - Scenario filter, if any
 * @param includeUnjudged - Accept results with no stored judge verdict
 * @param llmVerdictOnly - Reject results whose stored verdict came from Jev
 * @returns The result with its criteria, "ignored" (out of scope), or the skip reason
 */
function classify(
  result: JsonEvalResult | undefined,
  scenarios: Map<string, EvalScenario>,
  scenarioIds: string[] | undefined,
  includeUnjudged = false,
  llmVerdictOnly = false,
): "ignored" | keyof SkipCounts | { result: JsonEvalResult; criteria: string } {
  if (result == null) {
    return "unreadable";
  }

  // No judge on the result, or filtered out: not part of the comparison
  if (result.judge == null && !includeUnjudged) {
    return "ignored";
  }

  if (scenarioIds != null && !scenarioIds.includes(result.scenarioId)) {
    return "ignored";
  }

  if (result.result !== "pass" && result.result !== "fail") {
    return "notScored";
  }

  if (llmVerdictOnly && result.judge?.decidedBy === "jev") {
    return "jevDecided";
  }

  const scenario = scenarios.get(result.scenarioId);

  if (scenario == null) {
    return "noScenario";
  }

  const criteria = judgeCriteria(scenario);

  return criteria == null ? "noLlmJudge" : { result, criteria };
}

/**
 * Find the criteria the stored judge was given: the first llm_judge assertion.
 *
 * @param scenario - The scenario
 * @returns The judge prompt, or undefined
 */
function judgeCriteria(scenario: EvalScenario): string | undefined {
  for (const assertion of scenario.assertions) {
    if (assertion.type === "llm_judge") {
      return assertion.prompt;
    }
  }

  return undefined;
}

/**
 * List run directories, oldest first.
 *
 * @param dir - The results directory
 * @returns Run ids
 */
async function listRunDirs(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });

  return entries
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .toSorted();
}

/**
 * List the result files in one run directory.
 *
 * @param dir - A run directory
 * @returns File names ending in .json (none when the directory is missing)
 */
async function listJsonFiles(dir: string): Promise<string[]> {
  try {
    const names = await readdir(dir);

    return names.filter(isResultFile).toSorted();
  } catch {
    return [];
  }
}

/**
 * Read one result file, with its injected blocks restored to text.
 *
 * @param path - File path
 * @returns The result, or undefined when it can't be read or isn't a result
 */
async function readResult(path: string): Promise<JsonEvalResult | undefined> {
  try {
    const parsed = JSON.parse(await readFile(path, "utf8")) as JsonEvalResult;

    // Judges need the block text, not the hashes the file stores.
    return Array.isArray(parsed.turns)
      ? await restoreInjectedBlocks(parsed, dirname(path))
      : undefined;
  } catch {
    return undefined;
  }
}

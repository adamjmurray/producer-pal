// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Codex (OpenAI), Claude (Anthropic)
// SPDX-License-Identifier: MIT

/**
 * Scenario loader - loads and filters evaluation scenarios
 */

import { styleText } from "node:util";
import { shouldSkipScenario } from "../helpers/json-results/skip-scenario.ts";
import { envLabel, type RunEnv } from "../run-env/run-env.ts";
import { type EvalScenario } from "../types.ts";
import { allScenarios } from "./all-scenarios.ts";
import { SCENARIO_TAGS } from "./scenario-tags.ts";

export interface LoadScenariosOptions {
  /** Filter to specific test/scenario IDs */
  testIds?: string[];
  /** Filter to scenarios carrying ANY of these tags */
  tags?: string[];
}

/**
 * Load and filter scenarios. Ids and tags compose: give both and a scenario has
 * to match both.
 *
 * @param options - Filter options
 * @returns Filtered list of scenarios
 */
export function loadScenarios(options?: LoadScenariosOptions): EvalScenario[] {
  const testIds = options?.testIds ?? [];
  const tags = options?.tags ?? [];
  let scenarios = [...allScenarios];

  if (testIds.length > 0) {
    warnUnknownIds(testIds);
    scenarios = scenarios.filter((s) => testIds.includes(s.id));
  }

  if (tags.length > 0) {
    scenarios = scenarios.filter((s) => s.tags.some((t) => tags.includes(t)));
    warnDroppedIds(testIds, tags, scenarios);
  }

  if (scenarios.length === 0) {
    throw new Error(
      `No scenarios match ${describeFilter(testIds, tags)}. ` +
        `Run -l to list scenarios, --list-tags to list tags.`,
    );
  }

  return scenarios;
}

/**
 * Warn about requested ids no scenario has — a typo otherwise runs a shorter
 * suite in silence.
 *
 * @param testIds - The requested scenario ids
 */
function warnUnknownIds(testIds: string[]): void {
  const known = new Set(allScenarios.map((s) => s.id));
  const unknown = testIds.filter((id) => !known.has(id));

  if (unknown.length > 0) {
    console.warn(`Warning: Test(s) not found: ${unknown.join(", ")}`);
  }
}

/**
 * Warn about requested ids the tag filter removed — both filters must match, so
 * a scenario named with -t can silently fall out of the run.
 *
 * @param testIds - The requested scenario ids
 * @param tags - The requested tags
 * @param kept - The scenarios left after both filters
 */
function warnDroppedIds(
  testIds: string[],
  tags: string[],
  kept: EvalScenario[],
): void {
  const known = new Set(allScenarios.map((s) => s.id));
  const keptIds = new Set(kept.map((s) => s.id));
  const dropped = testIds.filter((id) => known.has(id) && !keptIds.has(id));

  if (dropped.length > 0) {
    console.warn(
      `Warning: Test(s) dropped by --tag ${tags.join(",")}: ${dropped.join(", ")}`,
    );
  }
}

/**
 * Describe the active filter for the "nothing matched" error.
 *
 * @param testIds - The requested scenario ids
 * @param tags - The requested tags
 * @returns A human-readable description of what was asked for
 */
function describeFilter(testIds: string[], tags: string[]): string {
  const parts: string[] = [];

  if (testIds.length > 0) {
    parts.push(`test(s) ${testIds.join(", ")}`);
  }

  if (tags.length > 0) {
    parts.push(`tag(s) ${tags.join(", ")}`);
  }

  return parts.join(" and ");
}

/**
 * List all available scenario IDs
 *
 * @returns Array of scenario IDs
 */
export function listScenarioIds(): string[] {
  return allScenarios.map((s) => s.id);
}

/**
 * List all scenarios with their kind and capability requirements for display
 *
 * @param env - Optional run environment; when given, each scenario carries the
 *   reason that environment would skip it (null when it would run)
 * @returns Array of {id, kind, tags, requires, skipReason} objects
 */
export function listScenarioSummaries(env?: RunEnv): Array<{
  id: string;
  kind: "regression" | "capability";
  tags: string[];
  requires: string[];
  skipReason: string | null;
}> {
  return allScenarios.map((s) => ({
    id: s.id,
    kind: s.kind ?? "regression",
    tags: s.tags,
    requires: requirementLabels(s),
    skipReason: env == null ? null : shouldSkipScenario(s, env),
  }));
}

/**
 * Format a scenario's capability requirements as short display labels.
 *
 * @param scenario - The scenario to inspect
 * @returns Requirement labels (empty when the scenario has no `requires`)
 */
function requirementLabels(scenario: EvalScenario): string[] {
  const req = scenario.requires;

  if (!req) {
    return [];
  }

  const labels: string[] = [];

  if (req.transforms) {
    labels.push("transforms");
  }

  if (req.brackets) {
    labels.push("brackets");
  }

  if (req.largeModel) {
    labels.push("largeModel");
  }

  if (req.tools?.length) {
    labels.push(`tools:${req.tools.join("+")}`);
  }

  if (req.params?.length) {
    labels.push(`params:${req.params.join("+")}`);
  }

  return labels;
}

/**
 * Print available scenarios. With a run environment, each scenario the
 * environment can't satisfy is marked SKIP with its reason, and a footer counts
 * what would actually be graded — the answer to "what does a `--small-model`
 * run really score?" without paying for the run.
 *
 * @param env - The run environment the list is for (omit for the plain list)
 */
export function printList(env?: RunEnv): void {
  console.log("Available scenarios:");

  const summaries = listScenarioSummaries(env);

  for (const { id, kind, tags, requires, skipReason } of summaries) {
    const metaLabel = styleText("gray", `[${kind}] [${tags.join(" ")}]`);
    const requiresLabel =
      requires.length > 0
        ? " " + styleText("yellow", `(requires: ${requires.join(", ")})`)
        : "";
    const skipLabel =
      skipReason == null ? "" : " " + styleText("red", `SKIP: ${skipReason}`);

    console.log(`  - ${id} ${metaLabel}${requiresLabel}${skipLabel}`);
  }

  if (env == null) {
    return;
  }

  printGradedCounts(summaries, env);
}

/**
 * Print every scenario tag with how many scenarios carry it — the answer to
 * "what can I pass to --tag?" without reading the whole scenario list.
 */
export function printTags(): void {
  const summaries = listScenarioSummaries();
  const width = Math.max(...SCENARIO_TAGS.map((tag) => tag.length));

  console.log("Scenario tags:");

  for (const tag of SCENARIO_TAGS) {
    const count = summaries.filter((s) => s.tags.includes(tag)).length;

    console.log(`  - ${tag.padEnd(width)}  ${count}`);
  }

  console.log(
    `\n${summaries.length} scenarios total (a scenario may carry more than one tag)`,
  );
}

/**
 * Print how many scenarios a run environment actually grades, by kind.
 *
 * @param summaries - The listed scenarios, each with its skip reason
 * @param env - The run environment being summarized
 */
function printGradedCounts(
  summaries: Array<{ kind: string; skipReason: string | null }>,
  env: RunEnv,
): void {
  const graded = summaries.filter((s) => s.skipReason == null);
  const byKind = (kind: string) =>
    `${graded.filter((s) => s.kind === kind).length}/${
      summaries.filter((s) => s.kind === kind).length
    }`;

  console.log(
    `\n${envLabel(env)}: grades ${graded.length} of ${summaries.length} ` +
      `(regression ${byKind("regression")}, capability ${byKind("capability")})`,
  );
}

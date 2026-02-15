// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Console table formatter for multi-model/config eval results
 */

import type { ModelSpec } from "#evals/shared/parse-model-arg.ts";
import type { ConfigProfile, EvalScenarioResult } from "../types.ts";
import { computeCorrectnessScore } from "./correctness-score.ts";
import type { JudgeResult } from "./judge-response-parser.ts";

/** A composite column in the results table (model + config) */
interface ColumnKey {
  modelKey: string;
  configId: string;
  label: string;
}

/** 3D results map: scenarioId → modelKey → configId → result */
export type ResultsByScenario = Map<
  string,
  Map<string, Map<string, EvalScenarioResult>>
>;

/**
 * Print results as a formatted table with composite model/config columns.
 * When a single config profile is used, column labels show model only.
 *
 * @param resultsByScenario - 3D results map
 * @param modelSpecs - All model specs tested
 * @param configProfiles - All config profiles tested
 */
export function printResultsTable(
  resultsByScenario: ResultsByScenario,
  modelSpecs: ModelSpec[],
  configProfiles: ConfigProfile[],
): void {
  const columns = buildColumnKeys(modelSpecs, configProfiles);
  const scenarioIds = [...resultsByScenario.keys()];

  // Calculate column widths
  const scenarioColWidth = Math.max(
    9, // "Avg Score"
    ...scenarioIds.map((id) => id.length),
  );
  const colWidths = columns.map(
    (col) => Math.max(col.label.length, 6), // min width for "✓ 4.5"
  );

  // Build table
  const separator = buildSeparator(scenarioColWidth, colWidths);
  const labels = columns.map((c) => c.label);
  const headerRow = buildRow("Scenario", labels, scenarioColWidth, colWidths);

  console.log("\n" + separator);
  console.log(headerRow);
  console.log(separator);

  // Data rows
  for (const [scenarioId, modelResults] of resultsByScenario) {
    const cells = columns.map((col) => {
      const result = modelResults.get(col.modelKey)?.get(col.configId);

      if (!result) return "—";
      const icon = result.passed ? "✓" : "✗";
      const score = getAverageScore(result);

      return score !== null ? `${icon} ${score.toFixed(1)}` : icon;
    });

    console.log(buildRow(scenarioId, cells, scenarioColWidth, colWidths));
  }

  // Summary rows
  console.log(separator);
  printSummaryRows(resultsByScenario, columns, scenarioColWidth, colWidths);
  console.log(separator);
}

/**
 * Build composite column keys from model specs and config profiles.
 * Single config: labels are model-only. Multiple configs: "model (config)".
 *
 * @param modelSpecs - Model specs
 * @param configProfiles - Config profiles
 * @returns Array of column keys
 */
function buildColumnKeys(
  modelSpecs: ModelSpec[],
  configProfiles: ConfigProfile[],
): ColumnKey[] {
  const singleConfig = configProfiles.length === 1;
  const columns: ColumnKey[] = [];

  for (const spec of modelSpecs) {
    const modelKey = spec.model
      ? `${spec.provider}/${spec.model}`
      : spec.provider;

    for (const profile of configProfiles) {
      const label = singleConfig ? modelKey : `${modelKey} (${profile.id})`;

      columns.push({ modelKey, configId: profile.id, label });
    }
  }

  return columns;
}

/**
 * Print passing and average score summary rows
 *
 * @param resultsByScenario - 3D results map
 * @param columns - Composite column keys
 * @param scenarioColWidth - Width of scenario column
 * @param colWidths - Widths of data columns
 */
function printSummaryRows(
  resultsByScenario: ResultsByScenario,
  columns: ColumnKey[],
  scenarioColWidth: number,
  colWidths: number[],
): void {
  // Passing row
  const passing = columns.map((col) => {
    let passed = 0;
    let total = 0;

    for (const modelResults of resultsByScenario.values()) {
      const result = modelResults.get(col.modelKey)?.get(col.configId);

      if (result) {
        total++;

        if (result.passed) passed++;
      }
    }

    return `${passed}/${total}`;
  });

  console.log(buildRow("Passing", passing, scenarioColWidth, colWidths));

  // Average score row
  const avgScores = columns.map((col) => {
    const scores: number[] = [];

    for (const modelResults of resultsByScenario.values()) {
      const result = modelResults.get(col.modelKey)?.get(col.configId);

      if (result) {
        const score = getAverageScore(result);

        if (score !== null) scores.push(score);
      }
    }

    if (scores.length === 0) return "—";
    const avg = scores.reduce((a, b) => a + b, 0) / scores.length;

    return avg.toFixed(1);
  });

  console.log(buildRow("Avg Score", avgScores, scenarioColWidth, colWidths));
}

/**
 * Get the combined average of all 5 dimensions (correctness + 4 LLM judge)
 *
 * @param result - The scenario result
 * @returns Combined average score
 */
function getAverageScore(result: EvalScenarioResult): number | null {
  const scores: number[] = [];

  // Add correctness score
  scores.push(computeCorrectnessScore(result.assertions));

  // Add LLM judge dimension scores
  for (const assertion of result.assertions) {
    if (assertion.assertion.type === "llm_judge") {
      const details = assertion.details as JudgeResult | undefined;

      if (details) {
        scores.push(
          details.accuracy.score,
          details.reasoning.score,
          details.efficiency.score,
          details.naturalness.score,
        );
      }
    }
  }

  if (scores.length === 0) return null;

  return scores.reduce((a, b) => a + b, 0) / scores.length;
}

/**
 * Build a separator line
 *
 * @param scenarioColWidth - Width of scenario column
 * @param colWidths - Widths of data columns
 * @returns Separator string
 */
function buildSeparator(scenarioColWidth: number, colWidths: number[]): string {
  const scenarioBar = "─".repeat(scenarioColWidth + 2);
  const colBars = colWidths.map((w) => "─".repeat(w + 2));

  return `├${scenarioBar}┼${colBars.join("┼")}┤`;
}

/**
 * Build a table row
 *
 * @param scenario - Scenario cell content
 * @param cells - Data column cell contents
 * @param scenarioColWidth - Width of scenario column
 * @param colWidths - Widths of data columns
 * @returns Formatted row string
 */
function buildRow(
  scenario: string,
  cells: string[],
  scenarioColWidth: number,
  colWidths: number[],
): string {
  const scenarioCell = scenario.padEnd(scenarioColWidth);
  const dataCells = cells.map((cell, i) => cell.padEnd(colWidths[i] ?? 0));

  return `│ ${scenarioCell} │ ${dataCells.join(" │ ")} │`;
}

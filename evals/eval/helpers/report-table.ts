/**
 * Console table formatter for multi-model eval results
 */

import type { ModelSpec } from "../index.ts";
import type { EvalScenarioResult } from "../types.ts";

interface JudgeDetails {
  score?: number;
}

/**
 * Print results as a formatted table
 *
 * @param resultsByScenario - Results organized by scenario ID then model key
 * @param modelSpecs - All model specs tested
 */
export function printResultsTable(
  resultsByScenario: Map<string, Map<string, EvalScenarioResult>>,
  modelSpecs: ModelSpec[],
): void {
  const modelKeys = modelSpecs.map((s) =>
    s.model ? `${s.provider}/${s.model}` : s.provider,
  );

  // Calculate column widths
  const scenarioIds = [...resultsByScenario.keys()];
  const scenarioColWidth = Math.max(
    9, // "Avg Score"
    ...scenarioIds.map((id) => id.length),
  );

  const modelColWidths = modelKeys.map(
    (key) => Math.max(key.length, 6), // min width for "✓ 4.5"
  );

  // Build table
  const separator = buildSeparator(scenarioColWidth, modelColWidths);
  const headerRow = buildRow(
    "Scenario",
    modelKeys,
    scenarioColWidth,
    modelColWidths,
  );

  console.log("\n" + separator);
  console.log(headerRow);
  console.log(separator);

  // Data rows - show pass/fail with score
  for (const [scenarioId, modelResults] of resultsByScenario) {
    const cells = modelKeys.map((key) => {
      const result = modelResults.get(key);

      if (!result) return "—";
      const icon = result.passed ? "✓" : "✗";
      const score = getAverageScore(result);

      if (score !== null) {
        return `${icon} ${score.toFixed(1)}`;
      }

      return icon;
    });

    console.log(buildRow(scenarioId, cells, scenarioColWidth, modelColWidths));
  }

  // Summary rows
  console.log(separator);

  // Passing row
  const passing = modelKeys.map((key) => {
    let passed = 0;
    let total = 0;

    for (const modelResults of resultsByScenario.values()) {
      const result = modelResults.get(key);

      if (result) {
        total++;

        if (result.passed) passed++;
      }
    }

    return `${passed}/${total}`;
  });

  console.log(buildRow("Passing", passing, scenarioColWidth, modelColWidths));

  // Average score row
  const avgScores = modelKeys.map((key) => {
    const scores: number[] = [];

    for (const modelResults of resultsByScenario.values()) {
      const result = modelResults.get(key);

      if (result) {
        const score = getAverageScore(result);

        if (score !== null) scores.push(score);
      }
    }

    if (scores.length === 0) return "—";
    const avg = scores.reduce((a, b) => a + b, 0) / scores.length;

    return avg.toFixed(1);
  });

  console.log(
    buildRow("Avg Score", avgScores, scenarioColWidth, modelColWidths),
  );
  console.log(separator);
}

/**
 * Get the average LLM judge score from a scenario result
 *
 * @param result - The scenario result
 * @returns Average score or null if no judge assertions
 */
function getAverageScore(result: EvalScenarioResult): number | null {
  const scores: number[] = [];

  for (const assertion of result.assertions) {
    if (assertion.assertion.type === "llm_judge") {
      const details = assertion.details as JudgeDetails | undefined;

      if (details?.score != null) {
        scores.push(details.score);
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
 * @param modelColWidths - Widths of model columns
 * @returns Separator string
 */
function buildSeparator(
  scenarioColWidth: number,
  modelColWidths: number[],
): string {
  const scenarioBar = "─".repeat(scenarioColWidth + 2);
  const modelBars = modelColWidths.map((w) => "─".repeat(w + 2));

  return `├${scenarioBar}┼${modelBars.join("┼")}┤`;
}

/**
 * Build a table row
 *
 * @param scenario - Scenario cell content
 * @param cells - Model column cell contents
 * @param scenarioColWidth - Width of scenario column
 * @param modelColWidths - Widths of model columns
 * @returns Formatted row string
 */
function buildRow(
  scenario: string,
  cells: string[],
  scenarioColWidth: number,
  modelColWidths: number[],
): string {
  const scenarioCell = scenario.padEnd(scenarioColWidth);
  const modelCells = cells.map((cell, i) =>
    cell.padEnd(modelColWidths[i] ?? 0),
  );

  return `│ ${scenarioCell} │ ${modelCells.join(" │ ")} │`;
}

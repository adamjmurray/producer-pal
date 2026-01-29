/**
 * Console table formatter for multi-model eval results
 */

import type { ModelSpec } from "../index.ts";
import type { EvalScenarioResult } from "../types.ts";

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
    8, // "Scenario"
    ...scenarioIds.map((id) => id.length),
  );

  const modelColWidths = modelKeys.map(
    (key) => Math.max(key.length, 8), // min width for "✓ 1234ms"
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

  // Data rows
  for (const [scenarioId, modelResults] of resultsByScenario) {
    const cells = modelKeys.map((key) => {
      const result = modelResults.get(key);

      if (!result) return "—";
      const icon = result.passed ? "✓" : "✗";
      const duration = formatDuration(result.totalDurationMs);

      return `${icon} ${duration}`;
    });

    console.log(buildRow(scenarioId, cells, scenarioColWidth, modelColWidths));
  }

  // Totals row
  console.log(separator);
  const totals = modelKeys.map((key) => {
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

  console.log(buildRow("Total", totals, scenarioColWidth, modelColWidths));
  console.log(separator);
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

/**
 * Format duration in human-readable form
 *
 * @param ms - Duration in milliseconds
 * @returns Formatted string (e.g., "1.2s" or "45ms")
 */
function formatDuration(ms: number): string {
  if (ms >= 1000) {
    return `${(ms / 1000).toFixed(1)}s`;
  }

  return `${ms}ms`;
}

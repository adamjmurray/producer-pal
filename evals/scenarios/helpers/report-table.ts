// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Console table formatter for multi-model/config eval results
 */

import { type InspectColor, styleText } from "node:util";
import { pctColor } from "#evals/chat/shared/formatting.ts";
import { type ModelSpec } from "#evals/shared/parse-model-arg.ts";
import { type ConfigProfile } from "../types.ts";
import { type JsonEvalResult } from "./json-results/types.ts";

/** A composite column in the results table (model + config) */
interface ColumnKey {
  modelKey: string;
  configId: string;
  label: string;
}

/** 3D results map: scenarioId → modelKey → configId → result */
export type ResultsByScenario = Map<
  string,
  Map<string, Map<string, JsonEvalResult>>
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
    5, // "Avg %"
    ...scenarioIds.map((id) => id.length),
  );
  const colWidths = columns.map(
    (col) => Math.max(col.label.length, 4), // min width for "85%"
  );

  // Build table
  const separator = buildSeparator(scenarioColWidth, colWidths);
  const labels = columns.map((c) => c.label);
  const headerRow = buildRow(
    "Scenario",
    labels,
    scenarioColWidth,
    colWidths,
    labels.map(() => "bold"),
    "bold",
  );

  console.log(`\n${styleText("gray", separator)}`);
  console.log(headerRow);
  console.log(styleText("gray", separator));

  // Data rows
  for (const [scenarioId, modelResults] of resultsByScenario) {
    const cells = columns.map((col) => {
      const result = modelResults.get(col.modelKey)?.get(col.configId);

      if (!result) return "—";
      const pct = getScorePercentage(result);

      if (pct == null) return "—";

      return `${pct.toFixed(0)}%`;
    });
    const colors = columns.map((col) => {
      const result = modelResults.get(col.modelKey)?.get(col.configId);
      const pct = result ? getScorePercentage(result) : null;

      return pct != null ? pctColor(pct) : undefined;
    });

    console.log(
      buildRow(scenarioId, cells, scenarioColWidth, colWidths, colors),
    );
  }

  // Summary rows
  console.log(styleText("gray", separator));
  printSummaryRow(resultsByScenario, columns, scenarioColWidth, colWidths);
  console.log(styleText("gray", separator));
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
 * Print average percentage summary row
 *
 * @param resultsByScenario - 3D results map
 * @param columns - Composite column keys
 * @param scenarioColWidth - Width of scenario column
 * @param colWidths - Widths of data columns
 */
function printSummaryRow(
  resultsByScenario: ResultsByScenario,
  columns: ColumnKey[],
  scenarioColWidth: number,
  colWidths: number[],
): void {
  const avgPcts = columns.map((col) => {
    const pcts: number[] = [];

    for (const modelResults of resultsByScenario.values()) {
      const result = modelResults.get(col.modelKey)?.get(col.configId);

      if (result) {
        const pct = getScorePercentage(result);

        if (pct !== null) pcts.push(pct);
      }
    }

    if (pcts.length === 0) return "—";
    const avg = pcts.reduce((a, b) => a + b, 0) / pcts.length;

    return `${avg.toFixed(0)}%`;
  });

  const avgColors = columns.map((col) => {
    const pcts2: number[] = [];

    for (const modelResults of resultsByScenario.values()) {
      const result = modelResults.get(col.modelKey)?.get(col.configId);

      if (result) {
        const p = getScorePercentage(result);

        if (p !== null) pcts2.push(p);
      }
    }

    if (pcts2.length === 0) return;
    const avg = pcts2.reduce((a, b) => a + b, 0) / pcts2.length;

    return pctColor(avg);
  });

  console.log(
    buildRow("Avg %", avgPcts, scenarioColWidth, colWidths, avgColors, "bold"),
  );
}

/**
 * Get the score percentage for a scenario result
 *
 * @param result - The scenario result
 * @returns Percentage (0-100) or null if no assertions
 */
function getScorePercentage(result: JsonEvalResult): number | null {
  const { results } = result.checks;

  if (results.length === 0) return null;
  const passed = results.filter((c) => c.pass).length;

  return Math.round((passed / results.length) * 100);
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

/** styleText format type for cell coloring */
type CellFormat = InspectColor | undefined;

/**
 * Build a table row with optional color for each cell
 *
 * @param scenario - Scenario cell content
 * @param cells - Data column cell contents
 * @param scenarioColWidth - Width of scenario column
 * @param colWidths - Widths of data columns
 * @param cellFormats - Optional per-cell styleText formats
 * @param scenarioFormat - Optional styleText format for the scenario cell
 * @returns Formatted row string
 */
function buildRow(
  scenario: string,
  cells: string[],
  scenarioColWidth: number,
  colWidths: number[],
  cellFormats?: CellFormat[],
  scenarioFormat?: InspectColor,
): string {
  const padded = scenario.padEnd(scenarioColWidth);
  const scenarioCell = scenarioFormat
    ? styleText(scenarioFormat, padded)
    : padded;
  const dataCells = cells.map((cell, i) => {
    const p = cell.padEnd(colWidths[i] ?? 0);
    const format = cellFormats?.[i];

    return format ? styleText(format, p) : p;
  });
  const div = styleText("gray", "│");
  const divider = ` ${div} `;

  return `${div} ${scenarioCell} ${div} ${dataCells.join(divider)} ${div}`;
}

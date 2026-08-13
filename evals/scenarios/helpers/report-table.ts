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
import { type JsonEvalResult } from "./json-results/types.ts";

/** A column in the results table (one per model). `configId` is the run-env
 *  label used to look up the cell's results. */
interface ColumnKey {
  modelKey: string;
  configId: string;
  label: string;
}

/** 3D results map: scenarioId → modelKey → configId → result(s) */
export type ResultsByScenario = Map<
  string,
  Map<string, Map<string, JsonEvalResult[]>>
>;

/**
 * Print results as a formatted table, one column per model. Each run uses a
 * single run environment, so column labels show the model only.
 *
 * @param resultsByScenario - 3D results map
 * @param modelSpecs - All model specs tested
 * @param label - The run-environment label (see `envLabel`)
 */
export function printResultsTable(
  resultsByScenario: ResultsByScenario,
  modelSpecs: ModelSpec[],
  label: string,
): void {
  const columns = buildColumnKeys(modelSpecs, label);
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
      const results = modelResults.get(col.modelKey)?.get(col.configId);

      if (!results || results.length === 0) return "—";
      if (isSkippedCell(results)) return "skip";
      const pct = getCellPercentage(results);

      if (pct == null) return "—";

      return `${pct.toFixed(0)}%`;
    });
    const colors = columns.map((col) => {
      const results = modelResults.get(col.modelKey)?.get(col.configId);

      if (results && isSkippedCell(results)) return "gray";
      const pct = results ? getCellPercentage(results) : null;

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
 * Build one column key per model. Each run uses a single run environment, so
 * the column label is the model key and the cell lookup is keyed by the
 * run-environment label.
 *
 * @param modelSpecs - Model specs
 * @param label - The run-environment label (see `envLabel`)
 * @returns Array of column keys
 */
function buildColumnKeys(modelSpecs: ModelSpec[], label: string): ColumnKey[] {
  return modelSpecs.map((spec) => {
    const modelKey = spec.model
      ? `${spec.provider}/${spec.model}`
      : spec.provider;

    return { modelKey, configId: label, label: modelKey };
  });
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
      const results = modelResults.get(col.modelKey)?.get(col.configId);

      if (results) {
        const pct = getCellPercentage(results);

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
      const results = modelResults.get(col.modelKey)?.get(col.configId);

      if (results) {
        const p = getCellPercentage(results);

        if (p !== null) pcts2.push(p);
      }
    }

    if (pcts2.length === 0) return undefined;
    const avg = pcts2.reduce((a, b) => a + b, 0) / pcts2.length;

    return pctColor(avg);
  });

  console.log(
    buildRow("Avg %", avgPcts, scenarioColWidth, colWidths, avgColors, "bold"),
  );
}

/**
 * Whether a cell represents a skipped scenario. Skipped scenarios never repeat,
 * so they're always a single `skipped` result.
 *
 * @param results - Results for this cell
 * @returns True if the cell is a single skipped result
 */
function isSkippedCell(results: JsonEvalResult[]): boolean {
  return results.length === 1 && results[0]?.result === "skipped";
}

/**
 * Get the display percentage for a table cell.
 * Single trial: check pass percentage. Multiple trials: trial pass rate.
 * Skipped scenarios have no checks, so they return null (excluded from averages).
 *
 * @param results - Array of results (1 for single run, N for repeated trials)
 * @returns Percentage (0-100) or null if no results
 */
function getCellPercentage(results: JsonEvalResult[]): number | null {
  if (results.length === 0) return null;

  // Multiple trials: show trial pass rate
  if (results.length > 1) {
    const passed = results.filter((r) => r.result === "pass").length;

    return Math.round((passed / results.length) * 100);
  }

  // Single trial: show check pass percentage
  const { results: checks } = (results[0] as JsonEvalResult).checks;

  if (checks.length === 0) return null;
  const passed = checks.filter((c) => c.pass).length;

  return Math.round((passed / checks.length) * 100);
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

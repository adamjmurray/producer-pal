// Producer Pal
// Copyright (C) 2026 Taylor Haun
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Persist eval matrix results to disk as JSON + a Markdown report.
 *
 * The console output is ephemeral; for a model-comparison matrix
 * (scenarios × models × configs) we want a durable record to analyze later.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  type ConfigProfile,
  type EvalScenarioResult,
} from "#evals/scenarios/types.ts";
import { type ModelSpec } from "#evals/shared/parse-model-arg.ts";
import { type ResultsByScenario } from "./report-table.ts";

/** A composite column in the results matrix (model + config). */
interface ColumnKey {
  modelKey: string;
  configId: string;
  label: string;
}

const DEFAULT_BASE_DIR = "eval-results";

/**
 * Save the full results matrix to a timestamped directory.
 *
 * Writes `results.json` (complete structured data) and `report.md`
 * (human-readable comparison + per-scenario breakdown).
 *
 * @param resultsByScenario - 3D results map (scenario → model → config → result)
 * @param modelSpecs - All model specs tested
 * @param configProfiles - All config profiles tested
 * @param baseDir - Base directory for output (default: `eval-results`)
 * @returns The directory the results were written to
 */
export function saveResults(
  resultsByScenario: ResultsByScenario,
  modelSpecs: ModelSpec[],
  configProfiles: ConfigProfile[],
  baseDir: string = DEFAULT_BASE_DIR,
): string {
  const timestamp = new Date().toISOString().replaceAll(/[.:]/g, "-");
  const outDir = join(baseDir, timestamp);

  mkdirSync(outDir, { recursive: true });

  const columns = buildColumns(modelSpecs, configProfiles);

  const json = buildJsonPayload(resultsByScenario, columns, timestamp);

  writeFileSync(join(outDir, "results.json"), JSON.stringify(json, null, 2));

  const markdown = buildMarkdownReport(resultsByScenario, columns, timestamp);

  writeFileSync(join(outDir, "report.md"), markdown);

  return outDir;
}

/**
 * Build composite column keys from model specs and config profiles.
 * Single config: labels are model-only. Multiple configs: "model (config)".
 *
 * @param modelSpecs - Model specs
 * @param configProfiles - Config profiles
 * @returns Array of column keys
 */
function buildColumns(
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
 * Build the serializable JSON payload for the whole matrix.
 *
 * @param resultsByScenario - 3D results map
 * @param columns - Composite columns
 * @param timestamp - Run timestamp
 * @returns A plain object ready for JSON.stringify
 */
function buildJsonPayload(
  resultsByScenario: ResultsByScenario,
  columns: ColumnKey[],
  timestamp: string,
): unknown {
  const scenarios: Record<string, unknown> = {};

  for (const [scenarioId, modelResults] of resultsByScenario) {
    const runs: Record<string, unknown> = {};

    for (const col of columns) {
      const result = modelResults.get(col.modelKey)?.get(col.configId);

      if (result == null) continue;
      runs[col.label] = serializeResult(result);
    }

    scenarios[scenarioId] = runs;
  }

  return {
    timestamp,
    columns: columns.map((c) => c.label),
    scenarios,
  };
}

/**
 * Serialize a single scenario result to a plain object.
 *
 * @param result - The scenario result
 * @returns A plain object with scores, assertions, and turns
 */
function serializeResult(result: EvalScenarioResult): unknown {
  const pct = scorePct(result);

  return {
    earnedScore: result.earnedScore,
    maxScore: result.maxScore,
    percentage: pct,
    durationMs: result.totalDurationMs,
    error: result.error ?? null,
    assertions: result.assertions.map((a) => ({
      type: a.assertion.type,
      earned: a.earned,
      maxScore: a.maxScore,
      message: a.message,
    })),
    turns: result.turns.map((t) => ({
      turnIndex: t.turnIndex,
      userMessage: t.userMessage,
      assistantResponse: t.assistantResponse,
      toolCalls: t.toolCalls.map((c) => ({ name: c.name, args: c.args })),
      durationMs: t.durationMs,
    })),
  };
}

/**
 * Build the Markdown report: a comparison table plus per-scenario details.
 *
 * @param resultsByScenario - 3D results map
 * @param columns - Composite columns
 * @param timestamp - Run timestamp
 * @returns The Markdown document as a string
 */
function buildMarkdownReport(
  resultsByScenario: ResultsByScenario,
  columns: ColumnKey[],
  timestamp: string,
): string {
  const lines: string[] = [
    `# Eval Results — ${timestamp}`,
    "",
    "## Comparison (score %)",
    "",
    ...comparisonTable(resultsByScenario, columns),
    "",
    "## Per-scenario detail",
    "",
  ];

  for (const [scenarioId, modelResults] of resultsByScenario) {
    lines.push(`### ${scenarioId}`, "");
    lines.push("| Run | Score | % | Duration | Error |");
    lines.push("| --- | --- | --- | --- | --- |");

    for (const col of columns) {
      const result = modelResults.get(col.modelKey)?.get(col.configId);

      if (result == null) {
        lines.push(`| ${col.label} | — | — | — | — |`);
        continue;
      }

      const pct = scorePct(result);
      const pctText = pct == null ? "—" : `${pct.toFixed(0)}%`;
      const error = result.error ?? "";

      lines.push(
        `| ${col.label} | ${formatScore(result.earnedScore)}/${result.maxScore}` +
          ` | ${pctText} | ${result.totalDurationMs}ms | ${error} |`,
      );
    }

    lines.push("");
  }

  return lines.join("\n");
}

/**
 * Build the Markdown comparison table rows (scenarios × columns).
 *
 * @param resultsByScenario - 3D results map
 * @param columns - Composite columns
 * @returns Array of Markdown lines for the table
 */
function comparisonTable(
  resultsByScenario: ResultsByScenario,
  columns: ColumnKey[],
): string[] {
  const header = `| Scenario | ${columns.map((c) => c.label).join(" | ")} |`;
  const divider = `| --- | ${columns.map(() => "---").join(" | ")} |`;
  const rows: string[] = [header, divider];
  const colTotals: number[][] = columns.map(() => []);

  for (const [scenarioId, modelResults] of resultsByScenario) {
    const cells = columns.map((col, i) => {
      const result = modelResults.get(col.modelKey)?.get(col.configId);
      const pct = result == null ? null : scorePct(result);

      if (pct == null) return "—";
      colTotals[i]?.push(pct);

      return `${pct.toFixed(0)}%`;
    });

    rows.push(`| ${scenarioId} | ${cells.join(" | ")} |`);
  }

  const avgCells = colTotals.map((pcts) =>
    pcts.length === 0
      ? "—"
      : `${(pcts.reduce((a, b) => a + b, 0) / pcts.length).toFixed(0)}%`,
  );

  rows.push(`| **Average** | ${avgCells.join(" | ")} |`);

  return rows;
}

/**
 * Get the score percentage for a scenario result.
 *
 * @param result - The scenario result
 * @returns Percentage (0-100) or null if there are no scored assertions
 */
function scorePct(result: EvalScenarioResult): number | null {
  if (result.maxScore === 0) return null;

  return (result.earnedScore / result.maxScore) * 100;
}

/**
 * Format a score for display (integer if whole, 1 decimal otherwise).
 *
 * @param score - The score to format
 * @returns Formatted score string
 */
function formatScore(score: number): string {
  return Number.isInteger(score) ? String(score) : score.toFixed(1);
}

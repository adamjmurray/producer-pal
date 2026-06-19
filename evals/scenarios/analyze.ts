#!/usr/bin/env node
// Producer Pal
// Copyright (C) 2026 Taylor Haun
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * CLI to analyze saved eval results.
 *
 * Usage:
 *   scripts/eval-analyze [path]
 *
 * `path` may be a results.json file, an eval-results/<timestamp> directory, or
 * omitted (defaults to the newest run under ./eval-results). Prints a Markdown
 * analysis and, when analyzing a directory, also writes analysis.md beside it.
 */

import {
  existsSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import {
  analyzeResults,
  parseResultsPayload,
  type DeltaRow,
  type ErrorRow,
  type LeaderboardRow,
  type ResultsAnalysis,
  type SpreadRow,
  type ToolUsageRow,
} from "./helpers/analyze-results.ts";
import { type PricingTable } from "./helpers/model-pricing.ts";

const DEFAULT_BASE_DIR = "eval-results";
const RESULTS_FILE = "results.json";
const PRICING_FILE = "eval-pricing.json";

main();

/**
 * Entry point: resolve the results file, analyze it, print + persist the report.
 */
function main(): void {
  try {
    const file = resolveResultsFile(process.argv[2]);
    const payload = parseResultsPayload(JSON.parse(readFileSync(file, "utf8")));
    const analysis = analyzeResults(payload, loadPricingOverrides());
    const report = formatAnalysis(analysis);

    console.log(report);

    const outPath = join(dirname(file), "analysis.md");

    writeFileSync(outPath, report);
    console.log(`\nAnalysis written to ${outPath}`);
  } catch (error) {
    console.error(
      "Error:",
      error instanceof Error ? error.message : String(error),
    );
    process.exit(1);
  }
}

/**
 * Resolve the results.json path from a CLI argument.
 *
 * @param arg - A file, a directory, or undefined
 * @returns Absolute path to a results.json file
 * @throws Error if no results file can be found
 */
function resolveResultsFile(arg?: string): string {
  if (arg == null) return findLatestResultsFile(DEFAULT_BASE_DIR);

  const target = resolve(arg);

  if (!existsSync(target)) {
    throw new Error(`Path not found: ${target}`);
  }

  if (statSync(target).isDirectory()) {
    const inDir = join(target, RESULTS_FILE);

    if (existsSync(inDir)) return inDir;

    return findLatestResultsFile(target);
  }

  return target;
}

/**
 * Load optional pricing overrides from `eval-pricing.json` in the cwd.
 *
 * @returns A pricing table, or undefined if the file is absent or invalid
 */
function loadPricingOverrides(): PricingTable | undefined {
  const file = resolve(PRICING_FILE);

  if (!existsSync(file)) return undefined;

  try {
    const parsed = JSON.parse(readFileSync(file, "utf8"));

    console.log(`Using pricing overrides from ${PRICING_FILE}`);

    return parsed as PricingTable;
  } catch {
    console.warn(`Ignoring ${PRICING_FILE}: could not parse JSON`);

    return undefined;
  }
}

/**
 * Find the most recent results.json under a base directory.
 *
 * @param baseDir - Directory containing timestamped run folders
 * @returns Absolute path to the newest results.json
 * @throws Error if none exist
 */
function findLatestResultsFile(baseDir: string): string {
  const base = resolve(baseDir);

  if (!existsSync(base)) {
    throw new Error(
      `No results found. Expected ${base}/<timestamp>/results.json — run scripts/eval first.`,
    );
  }

  const dirs = readdirSync(base)
    .map((name) => join(base, name))
    .filter((p) => statSync(p).isDirectory())
    .filter((p) => existsSync(join(p, RESULTS_FILE)))
    .sort();

  const latest = dirs.at(-1);

  if (latest == null) {
    throw new Error(`No results.json found under ${base}`);
  }

  return join(latest, RESULTS_FILE);
}

/**
 * Format the analysis as a Markdown document.
 *
 * @param analysis - The structured analysis
 * @returns Markdown string
 */
function formatAnalysis(analysis: ResultsAnalysis): string {
  return [
    `# Eval Analysis — ${analysis.timestamp}`,
    "",
    "## Leaderboard",
    "",
    ...formatLeaderboard(analysis.leaderboard),
    "",
    "## Best value (cost per point)",
    "",
    ...formatCostRanking(analysis.costRanking),
    "",
    "## Most discriminating scenarios (score spread)",
    "",
    ...formatSpread(analysis.spread),
    "",
    "## Small-model mode impact",
    "",
    ...formatDeltas(analysis.smallModelDeltas),
    "",
    "## Tool usage",
    "",
    ...formatToolUsage(analysis.toolUsage),
    "",
    "## Errors",
    "",
    ...formatErrors(analysis.errors),
    "",
  ].join("\n");
}

/**
 * Format the leaderboard table.
 *
 * @param rows - Leaderboard rows
 * @returns Markdown lines
 */
function formatLeaderboard(rows: LeaderboardRow[]): string[] {
  const lines = [
    "| Rank | Model (config) | Avg % | Score | Tokens | Cost | $/pt | Avg ms | Errors |",
    "| --- | --- | --- | --- | --- | --- | --- | --- | --- |",
  ];

  for (const [i, r] of rows.entries()) {
    lines.push(
      `| ${i + 1} | ${r.label} | ${pct(r.avgPct)} | ${r.totalEarned}/${r.totalMax}` +
        ` | ${tokens(r.totalTokens)} | ${usd(r.costUsd)} | ${usd(r.costPerPoint)}` +
        ` | ${r.avgDurationMs} | ${r.errorCount} |`,
    );
  }

  return lines;
}

/**
 * Format the cost-per-point (best value) ranking.
 *
 * @param rows - Cost-ranked leaderboard rows (best value first)
 * @returns Markdown lines
 */
function formatCostRanking(rows: LeaderboardRow[]): string[] {
  if (rows.length === 0) {
    return ["_No cost data (no token usage captured, or pricing unknown)._"];
  }

  const lines = [
    "| Rank | Model (config) | $/point | Cost | Avg % |",
    "| --- | --- | --- | --- | --- |",
  ];

  for (const [i, r] of rows.entries()) {
    lines.push(
      `| ${i + 1} | ${r.label} | ${usd(r.costPerPoint)} | ${usd(r.costUsd)} | ${pct(r.avgPct)} |`,
    );
  }

  return lines;
}

/**
 * Format the scenario-spread table.
 *
 * @param rows - Spread rows
 * @returns Markdown lines
 */
function formatSpread(rows: SpreadRow[]): string[] {
  const lines = [
    "| Scenario | Spread | Low | High |",
    "| --- | --- | --- | --- |",
  ];

  for (const r of rows) {
    const low = r.minLabel == null ? "—" : `${pct(r.minPct)} ${r.minLabel}`;
    const high = r.maxLabel == null ? "—" : `${pct(r.maxPct)} ${r.maxLabel}`;

    lines.push(`| ${r.scenario} | ${pct(r.spread)} | ${low} | ${high} |`);
  }

  return lines;
}

/**
 * Format the small-model delta table.
 *
 * @param rows - Delta rows
 * @returns Markdown lines
 */
function formatDeltas(rows: DeltaRow[]): string[] {
  if (rows.length === 0) {
    return [
      "_No model was run under both `default` and `small-model` configs._",
    ];
  }

  const lines = [
    "| Model | default % | small-model % | Δ (small − default) |",
    "| --- | --- | --- | --- |",
  ];

  for (const r of rows) {
    const delta =
      r.deltaPct == null
        ? "—"
        : `${r.deltaPct >= 0 ? "+" : ""}${r.deltaPct.toFixed(0)}%`;

    lines.push(
      `| ${r.modelKey} | ${pct(r.defaultPct)} | ${pct(r.smallModelPct)} | ${delta} |`,
    );
  }

  return lines;
}

/**
 * Format the per-column tool usage list.
 *
 * @param rows - Tool usage rows
 * @returns Markdown lines
 */
function formatToolUsage(rows: ToolUsageRow[]): string[] {
  const lines: string[] = [];

  for (const r of rows) {
    const tools =
      r.tools.length === 0
        ? "(none)"
        : r.tools.map((t) => `${t.name} ×${t.count}`).join(", ");

    lines.push(`- **${r.label}** (${r.totalCalls} calls): ${tools}`);
  }

  return lines;
}

/**
 * Format the error digest.
 *
 * @param rows - Error rows
 * @returns Markdown lines
 */
function formatErrors(rows: ErrorRow[]): string[] {
  if (rows.length === 0) return ["_No errored runs._"];

  return rows.map((r) => `- **${r.scenario}** / ${r.label}: ${r.error}`);
}

/**
 * Format a percentage value, or em-dash for null.
 *
 * @param value - Percentage (0-100) or null
 * @returns Display string
 */
function pct(value: number | null): string {
  return value == null ? "—" : `${value.toFixed(0)}%`;
}

/**
 * Format a USD amount with adaptive precision, or em-dash for null.
 *
 * @param value - Amount in USD or null
 * @returns Display string
 */
function usd(value: number | null): string {
  if (value == null) return "—";

  const decimals = value < 0.1 ? 4 : value < 10 ? 3 : 2;

  return `$${value.toFixed(decimals)}`;
}

/**
 * Format a token count compactly (k/M).
 *
 * @param value - Token count
 * @returns Display string
 */
function tokens(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}k`;

  return String(value);
}

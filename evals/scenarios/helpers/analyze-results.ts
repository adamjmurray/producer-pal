// Producer Pal
// Copyright (C) 2026 Taylor Haun
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: GPL-3.0-or-later

/**
 * Analyze a saved eval results payload (see save-results.ts) into structured
 * insights: a model leaderboard, scenario separation, small-model-mode deltas,
 * tool usage, and an error digest.
 *
 * Pure functions only — file I/O and formatting live in the analyze CLI so this
 * module stays easy to unit test.
 */

/** A single serialized scenario run (matches save-results.ts output). */
export interface SavedResult {
  earnedScore: number;
  maxScore: number;
  percentage: number | null;
  durationMs: number;
  error: string | null;
  assertions: Array<{
    type: string;
    earned: number;
    maxScore: number;
    message: string;
  }>;
  turns: Array<{
    turnIndex: number;
    userMessage: string;
    assistantResponse: string;
    toolCalls: Array<{ name: string; args: Record<string, unknown> }>;
    durationMs: number;
  }>;
}

/** The full saved payload (matches save-results.ts output). */
export interface SavedPayload {
  timestamp: string;
  columns: string[];
  scenarios: Record<string, Record<string, SavedResult>>;
}

/** One row of the model/config leaderboard. */
export interface LeaderboardRow {
  label: string;
  modelKey: string;
  configId: string;
  runCount: number;
  avgPct: number | null;
  totalEarned: number;
  totalMax: number;
  avgDurationMs: number;
  errorCount: number;
}

/** Per-scenario score spread across all columns. */
export interface SpreadRow {
  scenario: string;
  minPct: number | null;
  maxPct: number | null;
  spread: number | null;
  minLabel: string | null;
  maxLabel: string | null;
}

/** Small-model-mode delta for a model tested under both configs. */
export interface DeltaRow {
  modelKey: string;
  defaultPct: number | null;
  smallModelPct: number | null;
  deltaPct: number | null;
}

/** Tool-call tallies for one column. */
export interface ToolUsageRow {
  label: string;
  tools: Array<{ name: string; count: number }>;
  totalCalls: number;
}

/** A run that errored. */
export interface ErrorRow {
  scenario: string;
  label: string;
  error: string;
}

/** The complete structured analysis. */
export interface ResultsAnalysis {
  timestamp: string;
  leaderboard: LeaderboardRow[];
  spread: SpreadRow[];
  smallModelDeltas: DeltaRow[];
  toolUsage: ToolUsageRow[];
  errors: ErrorRow[];
}

const DEFAULT_CONFIG_ID = "default";
const SMALL_MODEL_CONFIG_ID = "small-model";

/**
 * Analyze a saved results payload into structured insights.
 *
 * @param payload - The parsed results.json payload
 * @returns The structured analysis
 */
export function analyzeResults(payload: SavedPayload): ResultsAnalysis {
  return {
    timestamp: payload.timestamp,
    leaderboard: buildLeaderboard(payload),
    spread: computeSpread(payload),
    smallModelDeltas: computeSmallModelDeltas(payload),
    toolUsage: computeToolUsage(payload),
    errors: collectErrors(payload),
  };
}

/**
 * Validate and narrow an unknown value to a SavedPayload.
 *
 * @param raw - Parsed JSON of unknown shape
 * @returns The value typed as SavedPayload
 * @throws Error if the shape is not a results payload
 */
export function parseResultsPayload(raw: unknown): SavedPayload {
  if (raw == null || typeof raw !== "object") {
    throw new Error("Results payload is not an object");
  }

  const obj = raw as Record<string, unknown>;

  if (typeof obj.timestamp !== "string" || obj.scenarios == null) {
    throw new Error("Results payload missing 'timestamp' or 'scenarios'");
  }

  return raw as SavedPayload;
}

/**
 * Split a column label into model key and config id.
 * Labels are "provider/model" or "provider/model (config-id)".
 *
 * @param label - The column label
 * @returns The model key and config id (defaults to "default")
 */
export function parseColumnLabel(label: string): {
  modelKey: string;
  configId: string;
} {
  const match = /^(.*?)(?: \(([^)]+)\))?$/.exec(label);

  if (match == null) return { modelKey: label, configId: DEFAULT_CONFIG_ID };

  return {
    modelKey: match[1] ?? label,
    configId: match[2] ?? DEFAULT_CONFIG_ID,
  };
}

/**
 * Build the leaderboard: one row per column, sorted by average % descending.
 *
 * @param payload - The results payload
 * @returns Leaderboard rows
 */
function buildLeaderboard(payload: SavedPayload): LeaderboardRow[] {
  const rows = payload.columns.map((label) => {
    const { modelKey, configId } = parseColumnLabel(label);
    const results = collectColumn(payload, label);
    const pcts = results.map(resultPct).filter((p): p is number => p != null);

    return {
      label,
      modelKey,
      configId,
      runCount: results.length,
      avgPct: average(pcts),
      totalEarned: sum(results.map((r) => r.earnedScore)),
      totalMax: sum(results.map((r) => r.maxScore)),
      avgDurationMs: Math.round(average(results.map((r) => r.durationMs)) ?? 0),
      errorCount: results.filter((r) => r.error != null).length,
    };
  });

  return rows.sort((a, b) => (b.avgPct ?? -1) - (a.avgPct ?? -1));
}

/**
 * Compute per-scenario score spread across columns (separation power).
 *
 * @param payload - The results payload
 * @returns Spread rows sorted by spread descending
 */
function computeSpread(payload: SavedPayload): SpreadRow[] {
  const rows: SpreadRow[] = [];

  for (const [scenario, runs] of Object.entries(payload.scenarios)) {
    let min: { pct: number; label: string } | null = null;
    let max: { pct: number; label: string } | null = null;

    for (const [label, result] of Object.entries(runs)) {
      const pct = resultPct(result);

      if (pct == null) continue;
      if (min == null || pct < min.pct) min = { pct, label };
      if (max == null || pct > max.pct) max = { pct, label };
    }

    rows.push({
      scenario,
      minPct: min?.pct ?? null,
      maxPct: max?.pct ?? null,
      spread: min != null && max != null ? max.pct - min.pct : null,
      minLabel: min?.label ?? null,
      maxLabel: max?.label ?? null,
    });
  }

  return rows.sort((a, b) => (b.spread ?? -1) - (a.spread ?? -1));
}

/**
 * Compute small-model-mode deltas for models tested under both configs.
 *
 * @param payload - The results payload
 * @returns Delta rows (small-model % minus default %)
 */
function computeSmallModelDeltas(payload: SavedPayload): DeltaRow[] {
  const byModel = new Map<string, Map<string, number | null>>();

  for (const label of payload.columns) {
    const { modelKey, configId } = parseColumnLabel(label);
    const pcts = collectColumn(payload, label)
      .map(resultPct)
      .filter((p): p is number => p != null);

    if (!byModel.has(modelKey)) byModel.set(modelKey, new Map());
    byModel.get(modelKey)?.set(configId, average(pcts));
  }

  const rows: DeltaRow[] = [];

  for (const [modelKey, configs] of byModel) {
    if (
      !configs.has(DEFAULT_CONFIG_ID) ||
      !configs.has(SMALL_MODEL_CONFIG_ID)
    ) {
      continue;
    }

    const defaultPct = configs.get(DEFAULT_CONFIG_ID) ?? null;
    const smallModelPct = configs.get(SMALL_MODEL_CONFIG_ID) ?? null;

    rows.push({
      modelKey,
      defaultPct,
      smallModelPct,
      deltaPct:
        defaultPct != null && smallModelPct != null
          ? smallModelPct - defaultPct
          : null,
    });
  }

  return rows.sort(
    (a, b) => (b.deltaPct ?? -Infinity) - (a.deltaPct ?? -Infinity),
  );
}

/**
 * Tally tool calls per column across all scenarios and turns.
 *
 * @param payload - The results payload
 * @returns Tool usage rows, one per column
 */
function computeToolUsage(payload: SavedPayload): ToolUsageRow[] {
  return payload.columns.map((label) => {
    const counts = new Map<string, number>();

    for (const result of collectColumn(payload, label)) {
      for (const turn of result.turns) {
        for (const call of turn.toolCalls) {
          counts.set(call.name, (counts.get(call.name) ?? 0) + 1);
        }
      }
    }

    const tools = [...counts.entries()]
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);

    return { label, tools, totalCalls: sum(tools.map((t) => t.count)) };
  });
}

/**
 * Collect all runs that errored.
 *
 * @param payload - The results payload
 * @returns Error rows
 */
function collectErrors(payload: SavedPayload): ErrorRow[] {
  const rows: ErrorRow[] = [];

  for (const [scenario, runs] of Object.entries(payload.scenarios)) {
    for (const [label, result] of Object.entries(runs)) {
      if (result.error != null) {
        rows.push({ scenario, label, error: result.error });
      }
    }
  }

  return rows;
}

/**
 * Collect a single column's results across all scenarios.
 *
 * @param payload - The results payload
 * @param label - The column label
 * @returns The results present for that column
 */
function collectColumn(payload: SavedPayload, label: string): SavedResult[] {
  const results: SavedResult[] = [];

  for (const runs of Object.values(payload.scenarios)) {
    const result = runs[label];

    if (result != null) results.push(result);
  }

  return results;
}

/**
 * Compute a result's score percentage defensively.
 *
 * @param result - A scenario run
 * @returns Percentage (0-100) or null when there is no scored max
 */
function resultPct(result: SavedResult): number | null {
  if (result.maxScore <= 0) return null;

  return (result.earnedScore / result.maxScore) * 100;
}

/**
 * Average a list of numbers.
 *
 * @param values - The numbers
 * @returns The mean, or null when empty
 */
function average(values: number[]): number | null {
  if (values.length === 0) return null;

  return sum(values) / values.length;
}

/**
 * Sum a list of numbers.
 *
 * @param values - The numbers
 * @returns The total
 */
function sum(values: number[]): number {
  return values.reduce((a, b) => a + b, 0);
}

// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/**
 * Text report for a Jev vs stored judge comparison.
 */

import {
  summarizeAgreement,
  type VerdictPair,
  type VerdictStats,
} from "./jev-agreement.ts";
import { type JevRoute } from "./jev-client.ts";
import { type JevJudgeResult } from "./jev-judge.ts";
import { type SkipCounts } from "./jev-results.ts";

/** Jev input price, USD per million tokens. */
export const JEV_USD_PER_M_INPUT_TOKENS = 0.042;

/** One compared result. `jev` is missing when the Jev call failed. */
export interface CompareEntry {
  file: string;
  scenarioId: string;
  /** The verdict stored in the saved result */
  judge: {
    pass: boolean;
    issues: string[];
    advisory?: boolean;
    provider?: string;
    model?: string;
  };
  /** The deterministic checks passed, so the judge decides the outcome */
  checksPass: boolean;
  jev?: JevJudgeResult;
  /** Why the Jev call failed */
  error?: string;
}

/**
 * Build the report lines: counts, verdict stats, wrong calls and cost.
 *
 * @param entries - Compared results
 * @param skipped - What the loader left out
 * @param route - The route the Jev calls went through
 * @returns Report lines
 */
export function formatReport(
  entries: CompareEntry[],
  skipped: SkipCounts,
  route?: JevRoute,
): string[] {
  const judged = entries.filter((e) => e.jev != null);
  const errors = entries.filter((e) => e.jev == null);

  return [
    "Jev vs stored judge",
    `Stored judge: ${judgeCounts(judged)}`,
    `Jev: ${route ?? "unknown route"}, ${jevModelCounts(judged)}`,
    `Compared ${judged.length} result(s); ${errors.length} Jev error(s).`,
    `Left out: ${skipped.notScored} skipped/error, ${skipped.noScenario} unknown scenario, ${skipped.noLlmJudge} scenario without llm_judge, ${skipped.unreadable} unreadable, ${skipped.staleCriteria} recorded before the criteria changed.`,
    "",
    ...statsLines(
      "Checks passed (the judge decides)",
      judged.filter((e) => e.checksPass),
    ),
    "",
    ...statsLines("All results", judged),
    "",
    `Truncated transcripts: ${judged.filter((e) => e.jev?.truncated).length}`,
    "",
    ...wrongCallLines(judged),
    ...errorLines(errors),
    "",
    costLine(judged),
  ];
}

/**
 * Format the verdict stats for one subset.
 *
 * @param title - Block heading
 * @param subset - Entries with a Jev answer
 * @returns Report lines
 */
function statsLines(title: string, subset: CompareEntry[]): string[] {
  const s: VerdictStats = summarizeAgreement(subset.map(toPair));

  return [
    `${title}: n=${s.n}, judge fails ${s.judgeFails}`,
    `  Jev pass ${s.jevPass}, fail ${s.jevFail}, escalate ${s.escalate} (${pct(s.escalatePct)})`,
    `  Wrong pass ${s.wrongPass}, wrong fail ${s.wrongFail}; agreement on non-escalated ${pct(s.agreePct)}`,
  ];
}

/**
 * Pair the stored judge and Jev verdicts for one entry.
 *
 * @param entry - A compared result with a Jev answer
 * @returns The verdict pair
 */
function toPair(entry: CompareEntry): VerdictPair {
  return {
    judgePass: entry.judge.pass,
    jev: entry.jev?.verdict ?? "escalate",
  };
}

/**
 * List the wrong passes and wrong fails (escalations are not listed).
 *
 * @param judged - Entries with a Jev answer
 * @returns Report lines
 */
function wrongCallLines(judged: CompareEntry[]): string[] {
  const lines = ["Wrong calls:"];
  let count = 0;

  for (const e of judged) {
    const jev = e.jev;
    const wrong =
      (jev?.verdict === "pass" && !e.judge.pass) ||
      (jev?.verdict === "fail" && e.judge.pass);

    if (jev == null || !wrong) {
      continue;
    }

    count++;
    const issues =
      e.judge.issues.length > 0 ? ` - ${e.judge.issues.join(" | ")}` : "";
    const probs = jev.questions
      .map((q) => `${q.id}=${q.probability.toFixed(2)}`)
      .join(" ");
    const kind = jev.verdict === "pass" ? "wrong pass" : "wrong fail";

    lines.push(
      `- ${e.file} (${kind})`,
      `  scenario ${e.scenarioId}; checks ${e.checksPass ? "passed" : "failed"}`,
      `  Judge (${judgeName(e)}): ${e.judge.pass ? "pass" : "fail"}${issues}`,
      `  Jev: ${jev.verdict} - ${probs}`,
    );
  }

  return count === 0 ? [...lines, "  (none)"] : lines;
}

/**
 * List results where the Jev call failed.
 *
 * @param errors - Entries without a Jev answer
 * @returns Report lines (empty when there are no errors)
 */
function errorLines(errors: CompareEntry[]): string[] {
  if (errors.length === 0) {
    return [];
  }

  return [
    "",
    "Jev errors:",
    ...errors.map((e) => `- ${e.file}: ${e.error ?? "unknown error"}`),
  ];
}

/**
 * Summarize tokens used and what they cost: the actual cost when every
 * answer carried one, otherwise an estimate from the TypeSafe price.
 *
 * @param judged - Entries with a Jev answer
 * @returns One report line
 */
function costLine(judged: CompareEntry[]): string {
  const tokens = judged.reduce((sum, e) => sum + (e.jev?.inputTokens ?? 0), 0);
  const costs = judged.map((e) => e.jev?.cost);

  if (judged.length > 0 && costs.every((c) => c != null)) {
    const actual = costs.reduce((sum, c) => sum + c, 0);

    return `Jev input tokens: ${tokens} (actual $${actual.toFixed(4)})`;
  }

  const usd = (tokens / 1_000_000) * JEV_USD_PER_M_INPUT_TOKENS;

  return `Jev input tokens: ${tokens} (~$${usd.toFixed(4)} estimated)`;
}

/**
 * Format a percentage.
 *
 * @param value - 0-100, or null
 * @returns Text like "87.5%" or "n/a"
 */
function pct(value: number | null): string {
  return value == null ? "n/a" : `${value.toFixed(1)}%`;
}

/**
 * Name the judge that gave an entry's stored verdict.
 *
 * @param entry - A compared result
 * @returns "provider/model", or "unknown" for results saved without it
 */
function judgeName(entry: CompareEntry): string {
  const { provider, model } = entry.judge;

  if (provider == null) {
    return "unknown";
  }

  return model == null ? provider : `${provider}/${model}`;
}

/**
 * Count the compared results per stored judge, most common first.
 *
 * @param entries - Compared results
 * @returns Text like "codex-code/luna (372), unknown (20)"
 */
function judgeCounts(entries: CompareEntry[]): string {
  const counts = new Map<string, number>();

  for (const e of entries) {
    counts.set(judgeName(e), (counts.get(judgeName(e)) ?? 0) + 1);
  }

  const sorted = [...counts].toSorted((a, b) => b[1] - a[1]);

  return sorted.map(([name, n]) => `${name} (${n})`).join(", ") || "none";
}

/**
 * Count the answers per resolved Jev model version, most common first.
 *
 * @param entries - Compared results with a Jev answer
 * @returns Text like "jev-1.14.0 (50)"
 */
function jevModelCounts(entries: CompareEntry[]): string {
  const counts = new Map<string, number>();

  for (const e of entries) {
    const model = e.jev?.model ?? "unknown";

    counts.set(model, (counts.get(model) ?? 0) + 1);
  }

  const sorted = [...counts].toSorted((a, b) => b[1] - a[1]);

  return sorted.map(([name, n]) => `${name} (${n})`).join(", ") || "none";
}

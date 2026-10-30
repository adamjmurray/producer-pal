// Producer Pal
// Copyright (C) 2026 Adam Murray
// AI assistance: Claude (Anthropic)
// SPDX-License-Identifier: MIT

/**
 * Text report for a Jev vs stored judge comparison.
 */

import {
  summarizeAgreement,
  summarizeOutcome,
  type OutcomeStats,
  type VerdictPair,
  type VerdictStats,
} from "./jev-agreement.ts";
import { type JevRoute } from "./jev-client.ts";
import { type JevJudgeResult } from "./jev-judge.ts";
import { type ReferenceVerdict } from "./sidecar-judges/jev-reference.ts";
import { type SkipCounts } from "./jev-results.ts";

/** Jev input price, USD per million tokens. */
export const JEV_USD_PER_M_INPUT_TOKENS = 0.042;

/** How many results the "Lowest outcome scores" section lists. */
const LOWEST_OUTCOME_COUNT = 10;

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
  /** Set when the reference is the sidecar LLM judges, not the stored judge.
   *  `judge.pass` is then their majority; a tie has no majority and is left
   *  out of the stats. */
  reference?: ReferenceVerdict;
  jev?: JevJudgeResult;
  /** Why the Jev call failed */
  error?: string;
}

/**
 * Build the report lines: counts, verdict stats, wrong calls, the lowest
 * outcome scores among judge passes, and cost.
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
  const errors = entries.filter((e) => e.jev == null);
  const answered = entries.filter((e) => e.jev != null);
  const judged = answered.filter(hasReference);
  const ties = answered.length - judged.length;
  const sidecars = entries.some((e) => e.reference != null);
  const tieNote =
    ties > 0 ? "; " + ties + " tied (no majority, not counted)" : "";

  return [
    sidecars ? "Jev vs LLM judges" : "Jev vs stored judge",
    `${sidecars ? "Reference" : "Stored judge"}: ${judgeCounts(judged)}`,
    `Jev: ${route ?? "unknown route"}, ${jevModelCounts(judged)}`,
    `Compared ${judged.length} result(s); ${errors.length} Jev error(s)${tieNote}.`,
    `Left out: ${skipped.notScored} skipped/error, ${skipped.noScenario} unknown scenario, ${skipped.noLlmJudge} scenario without llm_judge, ${skipped.unreadable} unreadable, ${skipped.staleCriteria} recorded before the criteria changed${jevNote(skipped)}.`,
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
    "",
    ...lowestOutcomeLines(judged),
    ...errorLines(errors),
    "",
    costLine(judged),
  ];
}

/**
 * Say why Jev-decided results are missing from a stored-judge comparison.
 *
 * @param skipped - What the loader left out
 * @returns A report fragment, or "" when nothing was left out for this reason
 */
function jevNote(skipped: SkipCounts): string {
  return skipped.jevDecided > 0
    ? `, ${skipped.jevDecided} decided by Jev in the run (no LLM verdict to compare; the compared results include the ones Jev escalated, which are the hard cases)`
    : "";
}

/**
 * Format the verdict stats for one subset.
 *
 * @param title - Block heading
 * @param subset - Entries with a Jev answer
 * @returns Report lines
 */
export function statsLines(title: string, subset: CompareEntry[]): string[] {
  const s: VerdictStats = summarizeAgreement(subset.map(toPair));
  const o = summarizeOutcome(
    subset.flatMap((e) =>
      e.jev == null
        ? []
        : [{ judgePass: e.judge.pass, score: e.jev.outcome.score }],
    ),
  );

  return [
    `${title}: n=${s.n}, judge fails ${s.judgeFails}`,
    `  Jev pass ${s.jevPass}, fail ${s.jevFail}, escalate ${s.escalate} (${pct(s.escalatePct)})`,
    `  Wrong pass ${s.wrongPass}, wrong fail ${s.wrongFail}; agreement on non-escalated ${pct(s.agreePct)}`,
    outcomeLine(o),
  ];
}

/**
 * Does the entry have a verdict to compare Jev against? Only a tie among the
 * LLM judges has none.
 *
 * @param entry - A compared result
 * @returns False for a tie
 */
function hasReference(entry: CompareEntry): boolean {
  return entry.reference == null || entry.reference.majority != null;
}

/**
 * Format the outcome score stats for one subset.
 *
 * @param o - Outcome stats
 * @returns One report line
 */
function outcomeLine(o: OutcomeStats): string {
  const auc = o.auc == null ? "n/a" : o.auc.toFixed(3);

  return `  Outcome score (0-3), mean: judge pass ${fixed(o.passMean)} (n=${o.passN}), judge fail ${fixed(o.failMean)} (n=${o.failN}); AUC ${auc}`;
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
      `  Jev: ${jev.verdict} - ${probs} outcome=${jev.outcome.score.toFixed(1)} ${jev.outcome.label}`,
    );
  }

  return count === 0 ? [...lines, "  (none)"] : lines;
}

/**
 * List the results with the lowest outcome score among those the stored judge
 * passed: candidates the judge may have missed.
 *
 * @param judged - Entries with a Jev answer
 * @returns Report lines
 */
function lowestOutcomeLines(judged: CompareEntry[]): string[] {
  const lowest = judged
    .filter((e) => e.judge.pass && e.jev != null)
    .toSorted(
      (a, b) => (a.jev?.outcome.score ?? 0) - (b.jev?.outcome.score ?? 0),
    )
    .slice(0, LOWEST_OUTCOME_COUNT);
  const lines = ["Lowest outcome scores (judge passed):"];

  for (const e of lowest) {
    const jev = e.jev;

    if (jev != null) {
      lines.push(
        `- ${e.file}: scenario ${e.scenarioId}; outcome=${jev.outcome.score.toFixed(1)} ${jev.outcome.label}; Jev ${jev.verdict}`,
      );
    }
  }

  return lowest.length === 0 ? [...lines, "  (none)"] : lines;
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
 * Format a mean to two decimals.
 *
 * @param value - A number, or null
 * @returns Text like "2.33" or "n/a"
 */
function fixed(value: number | null): string {
  return value == null ? "n/a" : value.toFixed(2);
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
